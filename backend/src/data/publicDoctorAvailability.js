const checkedAt = '2026-07-28T00:00:00.000Z';

const records = [
  {
    doctor: 'Dr. Ambrish Mithal',
    hospital: 'Max Super Specialty Hospital - Saket',
    sourceUrl: 'https://www.maxhealthcare.in/doctor/dr-ambrish-mithal',
    schedules: [
      { days: ['Mon', 'Sat'], hours: '9:00 AM - 3:00 PM' },
      { days: ['Tue', 'Thu'], hours: '9:00 AM - 12:00 PM' }
    ]
  },
  {
    doctor: 'Prof. (Dr.) Atul Sharma',
    hospital: 'Max Super Specialty Hospital - Saket',
    sourceUrl: 'https://www.maxhealthcare.in/doctor/dr-atul-sharma',
    schedules: [
      { days: ['Mon', 'Sat'], hours: '12:00 PM - 3:00 PM' },
      { days: ['Tue', 'Thu', 'Fri'], hours: '9:00 AM - 12:00 PM' },
      { days: ['Wed'], hours: '2:00 PM - 5:00 PM' }
    ]
  },
  {
    doctor: 'Dr. Puneet Agarwal',
    hospital: 'Max Super Specialty Hospital - Saket',
    sourceUrl: 'https://www.maxhealthcare.in/doctor/dr-puneet-agarwal',
    schedules: [
      { days: ['Mon', 'Wed', 'Fri'], hours: '9:30 AM - 7:30 PM' },
      { days: ['Tue', 'Thu', 'Sat'], hours: '11:30 AM - 7:30 PM' }
    ]
  },
  {
    doctor: 'Dr. Vivek Nangia',
    hospital: 'Max Super Specialty Hospital - Saket',
    sourceUrl: 'https://www.maxhealthcare.in/doctor/dr-vivek-nangia',
    schedules: [
      { days: ['Tue', 'Thu', 'Sat'], hours: '12:00 PM - 3:00 PM' }
    ]
  },
  {
    doctor: 'Dr. Rajashekar Reddi',
    hospital: 'Max Super Specialty Hospital - Saket',
    sourceUrl: 'https://www.maxhealthcare.in/doctor/dr-rajashekar-reddi',
    schedules: [
      { days: ['Mon', 'Wed', 'Fri'], hours: '12:00 PM - 7:00 PM' },
      { days: ['Tue', 'Thu', 'Sat'], hours: '9:00 AM - 5:00 PM' }
    ]
  },
  {
    doctor: 'Dr. Kavita Tyagi',
    hospital: 'Sir Ganga Ram Hospital',
    sourceUrl: 'https://sgrh.com/departments/cardiology/kavita-tyagi',
    schedules: [
      { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], hours: '6:00 PM - 8:00 PM', room: 'F-30' }
    ]
  },
  {
    doctor: 'Dr. J.P.S. Sawhney',
    hospital: 'Sir Ganga Ram Hospital',
    sourceUrl: 'https://sgrh.com/departments/cardiology/jps-sawhney',
    schedules: [
      { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], hours: '4:00 PM - 8:00 PM', room: 'F-25' }
    ]
  },
  {
    doctor: 'Dr. Sangeeta Sachdeva',
    hospital: 'Sir Ganga Ram Hospital',
    sourceUrl: 'https://sgrh.com/departments/cardiology/sangeeta-sachdeva',
    schedules: [
      { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], hours: '9:00 AM - 4:00 PM', room: 'Echo Lab / Room 16' }
    ]
  },
  {
    doctor: 'Dr. Prateek Kumar Gupta',
    hospital: 'Sir Ganga Ram Hospital',
    sourceUrl: 'https://sgrh.com/departments/orthopaedics/prateek-kumar-gupta',
    schedules: [
      { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], hours: '10:00 AM - 1:30 PM', room: 'F-23 / G-3' }
    ]
  }
];

const availabilityByDoctorHospital = new Map(
  records.map(record => [
    `${record.doctor.toLowerCase()}::${record.hospital.toLowerCase()}`,
    {
      type: 'published-weekly-opd-hours',
      liveSlots: false,
      checkedAt,
      sourceUrl: record.sourceUrl,
      schedules: record.schedules,
      notice: 'Published OPD hours are not guaranteed open slots. Confirm on the official booking page.'
    }
  ])
);

export function getPublicDoctorAvailability(doctorName, hospitalName) {
  if (!doctorName || !hospitalName) return null;
  return availabilityByDoctorHospital.get(
    `${doctorName.toLowerCase()}::${hospitalName.toLowerCase()}`
  ) || null;
}

export const publicAvailabilityRecordCount = records.length;
