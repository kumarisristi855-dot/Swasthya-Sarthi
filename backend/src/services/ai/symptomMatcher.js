import { supabase } from '../../lib/supabase.js';

// Rule-based mock classifier as a fallback if GROQ_API_KEY is not set or Groq fails
function getMockClassification(symptomText) {
  const text = symptomText.toLowerCase().trim();
  const hasAny = (...terms) => terms.some(term => text.includes(term));

  // Emergency warning signs take priority over specialty matching.
  if (
    hasAny(
      'chest pain',
      'difficulty breathing',
      'shortness of breath',
      'cannot breathe',
      "can't breathe",
      'unconscious',
      'stroke',
      'heart attack',
      'severe bleeding',
      'poisoning',
      'seizure'
    )
  ) {
    return {
      specialization: 'Cardiologist',
      urgency: 'emergency',
      confidence: 0.99
    };
  }

  // Named infectious diseases need hospital-based medical evaluation. Do not
  // imply that a generic directory physician is a disease specialist.
  if (hasAny('malaria', 'dengue', 'typhoid', 'chikungunya', 'tuberculosis', 'tb infection')) {
    return {
      specialization: 'General Physician',
      carePathway: 'Infectious Disease / General Medicine',
      hospitalOnly: true,
      urgency: 'same_day',
      confidence: 0.98
    };
  }

  if (hasAny('cancer', 'tumor', 'tumour', 'chemotherapy', 'oncology')) {
    return { specialization: 'Oncologist', urgency: 'same_day', confidence: 0.96 };
  }
  if (hasAny('kidney disease', 'kidney failure', 'dialysis', 'nephrology', 'creatinine')) {
    return { specialization: 'Nephrologist', urgency: 'same_day', confidence: 0.95 };
  }
  if (hasAny('asthma', 'wheezing', 'lung', 'pulmonary', 'respiratory')) {
    return { specialization: 'Pulmonologist', urgency: 'same_day', confidence: 0.94 };
  }
  if (hasAny('pregnant', 'pregnancy', 'period problem', 'menstrual', 'gynecology', 'gynaecology')) {
    return { specialization: 'Gynecologist', urgency: 'routine', confidence: 0.95 };
  }

  // Common systemic and respiratory illnesses are appropriate for primary care.
  if (hasAny('cold', 'fever', 'cough', 'flu', 'body ache', 'body pain', 'headache', 'weakness', 'fatigue', 'viral')) {
    const sameDay = hasAny(
      'high fever',
      'very high fever',
      'persistent fever',
      'fever for',
      'worsening',
      'dehydrated',
      'dehydration'
    );
    return {
      specialization: 'General Physician',
      urgency: sameDay ? 'same_day' : 'routine',
      confidence: 0.93
    };
  }

  if (hasAny('rash', 'skin', 'dermatology', 'itch', 'acne', 'eczema')) {
    return {
      specialization: 'Dermatologist',
      urgency: 'routine',
      confidence: 0.95
    };
  }

  if (hasAny('child', 'baby', 'pediatrician', 'kid', 'infant')) {
    return { specialization: 'Pediatrician', urgency: 'routine', confidence: 0.95 };
  }
  if (hasAny('tooth', 'teeth', 'dentist', 'gum', 'dental')) {
    return { specialization: 'Dentist', urgency: 'routine', confidence: 0.99 };
  }
  if (hasAny('eye', 'vision', 'ophthalmology', 'blurred vision')) {
    return { specialization: 'Ophthalmologist', urgency: 'routine', confidence: 0.95 };
  }
  if (hasAny('stomach', 'nausea', 'acid', 'gastro', 'abdominal', 'digestion', 'vomiting')) {
    return { specialization: 'Gastroenterologist', urgency: 'routine', confidence: 0.92 };
  }
  if (hasAny('ear', 'throat', 'nose', 'sinus', 'tonsil')) {
    return { specialization: 'ENT Specialist', urgency: 'routine', confidence: 0.92 };
  }
  if (hasAny('depress', 'anxiety', 'panic', 'mental', 'insomnia')) {
    return { specialization: 'Psychiatrist', urgency: 'routine', confidence: 0.95 };
  }
  if (hasAny('bone', 'fracture', 'joint', 'ortho', 'sprain', 'knee pain', 'back pain')) {
    return { specialization: 'Orthopedic', urgency: 'routine', confidence: 0.93 };
  }
  if (hasAny('urine', 'urinary', 'kidney stone', 'urology', 'prostate')) {
    return { specialization: 'Urologist', urgency: 'same_day', confidence: 0.9 };
  }
  if (hasAny('diabetes', 'thyroid', 'hormone', 'endocrine')) {
    return { specialization: 'Endocrinologist', urgency: 'routine', confidence: 0.93 };
  }
  if (hasAny('migraine', 'numbness', 'tingling', 'neurology', 'tremor')) {
    return { specialization: 'Neurologist', urgency: 'routine', confidence: 0.9 };
  }

  // Ask for clarification only when there is no usable symptom signal.
  if (
    !text ||
    /^(help|sick|unwell|vague|unclear|not well|dont feel good|don't feel good)$/i.test(text)
  ) {
    return { specialization: 'unclear', urgency: 'routine', confidence: 0.1 };
  }

  // An unknown term must not silently become a General Physician match.
  return { specialization: 'unclear', urgency: 'routine', confidence: 0.2 };
}

/**
 * Classifies patient symptoms into a medical specialization and urgency level.
 * Performs a Groq API call, falling back to a rule-based mock if API is unavailable.
 * 
 * @param {string} symptomText The raw text symptoms entered by the patient
 * @returns {Promise<{ specialization: string, urgency: string, confidence: number }>}
 */
export async function matchSymptoms(symptomText) {
  // 1. Fetch available specializations from public DB
  const { data: specializationsList, error: specError } = await supabase
    .from('specializations')
    .select('name');

  const specializations = (specializationsList || []).map(s => s.name);
  const groqKey = process.env.GROQ_API_KEY;

  if (specError) {
    console.error('Database error fetching specializations list:', specError);
  }

  // If GROQ_API_KEY is not defined, use the rule-based fallback directly
  if (!groqKey || groqKey === 'your-groq-api-key') {
    console.log('[AI MATCH] GROQ_API_KEY is missing or placeholder. Running rule-based fallback.');
    return getMockClassification(symptomText);
  }

  try {
    const promptSystem = `You are a medical symptom classifier. You must analyze the user's symptoms and match them to exactly ONE of the following valid specializations:
${JSON.stringify(specializations)}

Recognized short symptom phrases are sufficient. For example, "cold fever",
"cough and fever", "skin rash", and "tooth pain" must be classified rather
than marked unclear. Use General Physician for common cold, fever, cough,
flu-like illness, headache, weakness, or other general symptoms.

Only return "unclear" when the input contains no recognizable symptom or body
system, such as "help", "unwell", or "I feel bad".

For named infectious diseases such as malaria, dengue, typhoid, chikungunya,
or tuberculosis, use General Physician as the database specialization, set
"care_pathway" to "Infectious Disease / General Medicine", and set
"hospital_only" to true. This prevents presenting a general directory doctor
as a disease-specific specialist.

Determine the urgency level:
- "emergency": Immediate life-threatening symptoms (e.g. chest pain, breathing difficulties, stroke, severe bleeding, poisoning).
- "same_day": Non-life threatening but urgent symptoms (e.g. high fever, ear infections, severe localized pain).
- "routine": Non-urgent standard care symptoms (e.g. mild rashes, routine checkups, chronic mild symptoms).

Respond with a JSON object in this exact format:
{
  "specialization": "Specialization Name" or "unclear",
  "care_pathway": "Optional reader-facing care pathway" or null,
  "hospital_only": boolean,
  "urgency": "routine" | "same_day" | "emergency",
  "confidence": float (between 0.0 and 1.0)
}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: promptSystem },
          { role: 'user', content: symptomText }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!res.ok) {
      throw new Error(`Groq API returned HTTP error ${res.status}`);
    }

    const result = await res.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Groq response content is empty');
    }

    const classification = JSON.parse(content);
    
    // Normalize classification response fields
    return {
      specialization: classification.specialization || 'unclear',
      carePathway: classification.care_pathway || null,
      hospitalOnly: classification.hospital_only === true,
      urgency: classification.urgency || 'routine',
      confidence: typeof classification.confidence === 'number' ? classification.confidence : 0.5
    };

  } catch (err) {
    console.error('Groq AI call failed, falling back to rule-based classification:', err);
    return getMockClassification(symptomText);
  }
}
