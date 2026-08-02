import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const sourceLastUpdated = '2026-07-29';

const facilities = [
  {
    name: 'Prudence Hospital',
    address: 'Mahatma Gandhi Road, Bokaro Township, Bokaro, Jharkhand 827001',
    city: 'Bokaro',
    pincode: '827001',
    hospitalType: 'Hospital',
    latitude: 23.6504836,
    longitude: 86.1334898,
    sourceRecordId: 'osm-node-7011865229',
    sourceUrl: 'https://www.openstreetmap.org/node/7011865229'
  },
  {
    name: 'Life Line Hospital',
    address: 'Bye Pass Main Road, Chas, opposite Vaibhav Hotel, Bokaro Steel City, Jharkhand 827013',
    city: 'Chas',
    pincode: '827013',
    phone: '+91 9308051902',
    email: 'lifelinehospital2021@gmail.com',
    hospitalType: 'Hospital',
    latitude: 23.632761,
    longitude: 86.165142,
    sourceRecordId: 'osm-node-7676478566',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478566'
  },
  {
    name: 'Neelam Hospital and Research Centre',
    address: 'Main Road, Near Jodhadih More, Chas, Bokaro, Jharkhand 827013',
    city: 'Chas',
    pincode: '827013',
    hospitalType: 'Hospital',
    latitude: 23.6319288,
    longitude: 86.1825728,
    sourceRecordId: 'osm-node-7011736856',
    sourceUrl: 'https://www.openstreetmap.org/node/7011736856'
  },
  {
    name: 'City Care Hospital',
    address: 'SH12, Chas, Bokaro, Jharkhand 827013',
    city: 'Chas',
    pincode: '827013',
    hospitalType: 'Hospital',
    latitude: 23.6382875,
    longitude: 86.1614331,
    sourceRecordId: 'osm-node-7676478591',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478591'
  },
  {
    name: 'Sanvika Multispeciality Hospital',
    address: 'SH12, Chas, Bokaro, Jharkhand 827013',
    city: 'Chas',
    pincode: '827013',
    hospitalType: 'Hospital',
    latitude: 23.637131,
    longitude: 86.160725,
    sourceRecordId: 'osm-node-7676478615',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478615'
  },
  {
    name: 'Government Hospital Chirachas',
    address: 'Bhara Basti, Chira Chas, Bokaro, Jharkhand 827013',
    city: 'Chas',
    pincode: '827013',
    hospitalType: 'Hospital',
    latitude: 23.6484732,
    longitude: 86.1686106,
    sourceRecordId: 'osm-node-7121616538',
    sourceUrl: 'https://www.openstreetmap.org/node/7121616538'
  },
  {
    name: 'Jeevan Jyoti Nursing Home',
    address: 'NH18, Bhawanipur, Chas, Bokaro, Jharkhand 827013',
    city: 'Chas',
    pincode: '827013',
    hospitalType: 'Nursing home',
    latitude: 23.6316825,
    longitude: 86.1871486,
    sourceRecordId: 'osm-node-7676478540',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478540'
  },
  {
    name: 'Usha Polio Nursing Home',
    address: 'SH12, Bhawanipur, Chas, Bokaro, Jharkhand 827013',
    city: 'Chas',
    pincode: '827013',
    hospitalType: 'Nursing home',
    latitude: 23.628326,
    longitude: 86.1891867,
    sourceRecordId: 'osm-node-7676478613',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478613'
  },
  {
    name: 'Asha Sahshi Hospital',
    address: 'NH18, Bhawanipur, Chas, Bokaro, Jharkhand 827013',
    city: 'Chas',
    pincode: '827013',
    hospitalType: 'Hospital',
    latitude: 23.6386138,
    longitude: 86.194383,
    sourceRecordId: 'osm-node-7676478607',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478607'
  },
  {
    name: 'Bokaro Surgical Clinic',
    address: 'Mahatma Gandhi Road, Bokaro Township, Bokaro, Jharkhand 827001',
    city: 'Bokaro',
    pincode: '827001',
    hospitalType: 'Clinic',
    latitude: 23.6511313,
    longitude: 86.1366181,
    sourceRecordId: 'osm-node-7121616442',
    sourceUrl: 'https://www.openstreetmap.org/node/7121616442'
  },
  {
    name: 'Asha Hospital',
    address: 'Mahatma Gandhi Road, Bokaro Township, Bokaro, Jharkhand 827001',
    city: 'Bokaro',
    pincode: '827001',
    hospitalType: 'Hospital',
    latitude: 23.6497136,
    longitude: 86.1355901,
    sourceRecordId: 'osm-node-7676478583',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478583'
  },
  {
    name: 'Muskan Superspeciality Center',
    address: 'Indira Gandhi Marg, Bokaro Township, Bokaro, Jharkhand 827004',
    city: 'Bokaro',
    pincode: '827004',
    hospitalType: 'Clinic',
    latitude: 23.6654579,
    longitude: 86.1526799,
    sourceRecordId: 'osm-node-6307738085',
    sourceUrl: 'https://www.openstreetmap.org/node/6307738085'
  },
  {
    name: 'City Hospital',
    address: 'Mahatma Gandhi Road, Bokaro Township, Bokaro, Jharkhand 827001',
    city: 'Bokaro',
    pincode: '827001',
    hospitalType: 'Hospital',
    latitude: 23.6491797,
    longitude: 86.1345407,
    sourceRecordId: 'osm-node-7676478597',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478597'
  },
  {
    name: 'Narayani Hospital',
    address: 'Mahatma Gandhi Road, Bokaro Township, Bokaro, Jharkhand 827001',
    city: 'Bokaro',
    pincode: '827001',
    hospitalType: 'Hospital',
    latitude: 23.6510906,
    longitude: 86.1353192,
    sourceRecordId: 'osm-node-7676478565',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478565'
  },
  {
    name: 'Hope Hospital',
    address: 'Indira Gandhi Marg, Bokaro Township, Bokaro, Jharkhand 827004',
    city: 'Bokaro',
    pincode: '827004',
    hospitalType: 'Hospital',
    latitude: 23.6659073,
    longitude: 86.1521325,
    sourceRecordId: 'osm-node-7011104522',
    sourceUrl: 'https://www.openstreetmap.org/node/7011104522'
  },
  {
    name: 'Krishna Nursing Home',
    address: 'Mahatma Gandhi Road, Bokaro Township, Bokaro, Jharkhand 827001',
    city: 'Bokaro',
    pincode: '827001',
    hospitalType: 'Nursing home',
    latitude: 23.6502759,
    longitude: 86.1333397,
    sourceRecordId: 'osm-node-7676478546',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478546'
  },
  {
    name: 'Vrindavan Nursing Home',
    address: 'Indira Gandhi Marg, Bokaro Township, Bokaro, Jharkhand 827004',
    city: 'Bokaro',
    pincode: '827004',
    hospitalType: 'Nursing home',
    latitude: 23.6664416,
    longitude: 86.1500725,
    sourceRecordId: 'osm-node-7011463960',
    sourceUrl: 'https://www.openstreetmap.org/node/7011463960'
  },
  {
    name: 'Bokaro Health Care Hospital',
    address: 'Mahatma Gandhi Road, Bokaro Township, Bokaro, Jharkhand 827001',
    city: 'Bokaro',
    pincode: '827001',
    hospitalType: 'Hospital',
    latitude: 23.6482638,
    longitude: 86.1322031,
    sourceRecordId: 'osm-node-7676478624',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478624'
  },
  {
    name: 'Raj Nursing Home',
    address: 'Indira Gandhi Marg, Bokaro Township, Bokaro, Jharkhand 827004',
    city: 'Bokaro',
    pincode: '827004',
    hospitalType: 'Nursing home',
    latitude: 23.6664469,
    longitude: 86.1499011,
    sourceRecordId: 'osm-node-7121616443',
    sourceUrl: 'https://www.openstreetmap.org/node/7121616443'
  },
  {
    name: 'Ashadeep Hospital and Research Centre',
    address: 'Mahatma Gandhi Road, Bokaro Township, Bokaro, Jharkhand 827001',
    city: 'Bokaro',
    pincode: '827001',
    hospitalType: 'Hospital',
    latitude: 23.6480619,
    longitude: 86.1320216,
    sourceRecordId: 'osm-node-7676478584',
    sourceUrl: 'https://www.openstreetmap.org/node/7676478584'
  }
];

async function main() {
  const rows = facilities.map(facility => ({
    name: facility.name,
    address: facility.address,
    city: facility.city,
    district: 'Bokaro',
    state: 'Jharkhand',
    pincode: facility.pincode,
    phone: facility.phone || null,
    email: facility.email || null,
    latitude: facility.latitude,
    longitude: facility.longitude,
    hospital_type: facility.hospitalType,
    departments: [],
    source_dataset: 'openstreetmap-community-healthcare',
    source_record_id: facility.sourceRecordId,
    source_url: facility.sourceUrl,
    source_last_updated: sourceLastUpdated,
    verification_status: 'unverified',
    verification_source_url: facility.sourceUrl,
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from('hospitals')
    .upsert(rows, { onConflict: 'source_dataset,source_record_id' })
    .select('id,name');

  if (error) throw error;

  console.log(`Upserted ${data?.length || rows.length} Bokaro/Chas community healthcare facilities.`);
}

try {
  await main();
} catch (error) {
  console.error('Bokaro community facility seed failed:', error.message || error);
  process.exitCode = 1;
}
