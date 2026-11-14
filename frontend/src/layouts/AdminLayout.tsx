import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, Baby, GraduationCap, School, Camera,
  CalendarCheck, Activity, KeyRound, Bell, Settings, Server, Video, Play,
} from 'lucide-react';
import DashboardLayout, { NavItem } from './DashboardLayout';

const navItems: NavItem[] = [
  { to: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={18} /> },
  { to: 'parents', label: 'Parent Management', icon: <Users size={18} /> },
  { to: 'children', label: 'Child Management', icon: <Baby size={18} /> },
  { to: 'teachers', label: 'Teacher Management', icon: <GraduationCap size={18} /> },
  { to: 'classrooms', label: 'Classroom Management', icon: <School size={18} /> },
  { to: 'nvrs', label: 'NVR Management', icon: <Server size={18} /> },
  { to: 'cameras', label: 'Camera Management', icon: <Camera size={18} /> },
  { to: 'live-wall', label: 'Live Wall', icon: <Video size={18} /> },
  { to: 'playback', label: 'Playback', icon: <Play size={18} /> },
  { to: 'attendance', label: 'Attendance Reports', icon: <CalendarCheck size={18} /> },
  { to: 'activities', label: 'Activity Reports', icon: <Activity size={18} /> },
  { to: 'access-requests', label: 'Access Requests', icon: <KeyRound size={18} /> },
  { to: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
  { to: 'settings', label: 'Settings', icon: <Settings size={18} /> },
];

export default function AdminLayout() {
  return (
    <DashboardLayout title="Admin Portal" navItems={navItems} basePath="/admin">
      <Outlet />
    </DashboardLayout>
  );
}
