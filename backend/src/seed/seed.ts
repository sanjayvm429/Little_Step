import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { User } from '../models/User.js';
import { Classroom } from '../models/Classroom.js';
import { Child } from '../models/Child.js';
import { ParentChildRelationship } from '../models/ParentChildRelationship.js';
import { Camera } from '../models/Camera.js';
import { CameraAccessPermission } from '../models/CameraAccessPermission.js';
import { Attendance } from '../models/Attendance.js';
import { Activity } from '../models/Activity.js';
import { Announcement } from '../models/Announcement.js';
import { PickupAuthorization } from '../models/PickupAuthorization.js';
import { SafetyIncident } from '../models/SafetyIncident.js';
import { encrypt } from '../config/index.js';

async function seed() {
  await mongoose.connect(config.mongoUri);
  console.log('Connected. Clearing collections...');

  const collections = [
    User, Classroom, Child, ParentChildRelationship, Camera, CameraAccessPermission,
    Attendance, Activity, Announcement, PickupAuthorization, SafetyIncident,
  ];
  for (const m of collections) await (m as unknown as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({});

  const passwordHash = await bcrypt.hash('Password123', 12);

  // Users
  const admin = await User.create({
    fullName: 'Admin User', email: 'admin@littlesteps.com', passwordHash,
    role: 'admin', isEmailVerified: true,
  });
  const teacher = await User.create({
    fullName: 'Teacher One', email: 'teacher@littlesteps.com', phone: '9999999999',
    passwordHash, role: 'teacher', isEmailVerified: true,
  });
  const parent = await User.create({
    fullName: 'Parent One', email: 'parent@littlesteps.com', phone: '8888888888',
    passwordHash, role: 'parent', isEmailVerified: true,
  });

  // Classrooms
  const classroom1 = await Classroom.create({ name: 'Sunshine', ageGroup: '2-3 years', capacity: 15, teacher: teacher._id });
  const classroom2 = await Classroom.create({ name: 'Rainbow', ageGroup: '3-4 years', capacity: 18, teacher: teacher._id });

  // Children
  const child1 = await Child.create({
    fullName: 'Aarav Sharma', dateOfBirth: new Date('2022-05-10'), gender: 'male',
    admissionNumber: 'LS-001', classroom: classroom1._id, teacher: teacher._id,
    emergencyContacts: [{ name: 'Parent One', phone: '8888888888', relationship: 'father' }],
    medicalInfo: { allergies: ['nuts'] },
  });
  const child2 = await Child.create({
    fullName: 'Diya Patel', dateOfBirth: new Date('2021-08-22'), gender: 'female',
    admissionNumber: 'LS-002', classroom: classroom1._id, teacher: teacher._id,
    emergencyContacts: [{ name: 'Parent One', phone: '8888888888', relationship: 'mother' }],
  });
  const child3 = await Child.create({
    fullName: 'Kabir Singh', dateOfBirth: new Date('2020-01-15'), gender: 'male',
    admissionNumber: 'LS-003', classroom: classroom2._id, teacher: teacher._id,
  });

  // Relationships (approved)
  await ParentChildRelationship.create([
    { parent: parent._id, child: child1._id, relationship: 'father', status: 'approved',
      permissions: { canViewCamera: true, canViewActivities: true, canViewAttendance: true } },
    { parent: parent._id, child: child2._id, relationship: 'mother', status: 'approved',
      permissions: { canViewCamera: true, canViewActivities: true, canViewAttendance: true } },
  ]);

  // Cameras (simulated)
  const cam1 = await Camera.create({
    name: 'Sunshine Main Camera', cameraId: 'CAM-001', location: 'Sunshine Classroom',
    classroom: classroom1._id, streamKey: 'sunshine-main', status: 'online', isSimulated: true,
    description: 'Main play area camera',
  });
  const cam2 = await Camera.create({
    name: 'Rainbow Activity Camera', cameraId: 'CAM-002', location: 'Rainbow Classroom',
    classroom: classroom2._id, streamKey: 'rainbow-activity', status: 'online', isSimulated: true,
    description: 'Activity room camera',
  });

  // Camera permissions for parent
  await CameraAccessPermission.create([
    { camera: cam1._id, user: parent._id, grantedBy: admin._id, status: 'active' },
    { camera: cam2._id, user: parent._id, grantedBy: admin._id, status: 'active' },
  ]);

  // Today's attendance
  const today = new Date(); today.setHours(0, 0, 0, 0);
  await Attendance.create([
    { child: child1._id, classroom: classroom1._id, date: today, checkIn: new Date(today.getTime() + 9 * 3600e3), status: 'present' },
    { child: child2._id, classroom: classroom1._id, date: today, checkIn: new Date(today.getTime() + 9.2 * 3600e3), status: 'late' },
    { child: child3._id, classroom: classroom2._id, date: today, checkIn: new Date(today.getTime() + 8.8 * 3600e3), status: 'present' },
  ]);

  // Activities today
  await Activity.create([
    { child: child1._id, classroom: classroom1._id, category: 'breakfast', title: 'Breakfast', status: 'completed',
      date: today, startTime: new Date(today.getTime() + 9.5 * 3600e3), endTime: new Date(today.getTime() + 10 * 3600e3) },
    { child: child1._id, classroom: classroom1._id, category: 'learning', title: 'Color sorting activity', status: 'completed',
      date: today, startTime: new Date(today.getTime() + 10.5 * 3600e3) },
    { child: child2._id, classroom: classroom1._id, category: 'outdoor', title: 'Outdoor play', status: 'in_progress',
      date: today, startTime: new Date(today.getTime() + 11 * 3600e3) },
  ]);

  // Announcement
  await Announcement.create({
    title: 'Welcome to LittleSteps', body: 'We are excited to have your children with us!',
    audience: 'all_parents', createdBy: admin._id,
  });

  // Pickup authorization (approved)
  await PickupAuthorization.create({
    child: child1._id, name: 'Grandma Rao', phone: '7777777777', relationship: 'grandmother',
    status: 'approved', requestedBy: parent._id, reviewedBy: admin._id,
  });

  // Safety incident (resolved example)
  await SafetyIncident.create({
    child: child3._id, type: 'minor_scrape', severity: 'low',
    description: 'Small scrape on knee during outdoor play. Cleaned and bandaged.',
    actionsTaken: 'First aid applied, parent notified.', status: 'resolved', reportedBy: teacher._id,
  });

  console.log('Seed complete.');
  console.log('Login credentials (password: Password123):');
  console.log('  admin@littlesteps.com  (admin)');
  console.log('  teacher@littlesteps.com (teacher)');
  console.log('  parent@littlesteps.com  (parent)');
  await mongoose.disconnect();
}

seed().catch((e) => { console.error(e); process.exit(1); });
