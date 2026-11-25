import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, Baby, GraduationCap, School, Camera,
  CalendarCheck, Activity, KeyRound, Bell, Settings, Server, Video, Play, UserPlus,
} from 'lucide-react';
import DashboardLayout, { NavItem } from './DashboardLayout';

const navItems: NavItem[] = [
  { to: 'dashboard', label: 'Command Center', icon: <LayoutDashboard size={17} />, group: 'Monitor' },
  { to: 'live-wall', label: 'Live Wall', icon: <Video size={17} />, group: 'Monitor' },
  { to: 'playback', label: 'Recording Playback (Paused)', icon: <Play size={17} />, group: 'Monitor' },
  { to: 'parents', label: 'Parents', icon: <Users size={17} />, group: 'People' },
  { to: 'children', label: 'Children', icon: <Baby size={17} />, group: 'People' },
  { to: 'teachers', label: 'Teachers', icon: <GraduationCap size={17} />, group: 'People' },
  { to: 'employees', label: 'Register User', icon: <UserPlus size={17} />, group: 'People' },
  { to: 'classrooms', label: 'Classrooms', icon: <School size={17} />, group: 'People' },
  { to: 'attendance', label: 'Attendance', icon: <CalendarCheck size={17} />, group: 'Operations' },
  { to: 'face-attendance', label: 'Face Attendance', icon: <Activity size={17} />, group: 'Operations' },
  { to: 'activities', label: 'Daily activities', icon: <Activity size={17} />, group: 'Operations' },
  { to: 'access-requests', label: 'Access requests', icon: <KeyRound size={17} />, group: 'Operations' },
  { to: 'notifications', label: 'Notifications', icon: <Bell size={17} />, group: 'Operations' },
  { to: 'nvrs', label: 'NVR management', icon: <Server size={17} />, group: 'Devices' },
  { to: 'cameras', label: 'Camera management', icon: <Camera size={17} />, group: 'Devices' },
  { to: 'settings', label: 'Settings', icon: <Settings size={17} />, group: 'System' },
];

export default function AdminLayout() {
  return (
    <DashboardLayout title="Command Center" navItems={navItems} basePath="/admin">
      <Outlet />
    </DashboardLayout>
  );
}
