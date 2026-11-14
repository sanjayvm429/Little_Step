import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard, School, Users, CalendarCheck, Activity,
  MessageSquare, Megaphone, User,
} from 'lucide-react';
import DashboardLayout, { NavItem } from './DashboardLayout';

const navItems: NavItem[] = [
  { to: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={18} /> },
  { to: 'classrooms', label: 'My Classrooms', icon: <School size={18} /> },
  { to: 'children', label: 'Children', icon: <Users size={18} /> },
  { to: 'attendance', label: 'Attendance', icon: <CalendarCheck size={18} /> },
  { to: 'activities', label: 'Daily Activities', icon: <Activity size={18} /> },
  { to: 'messages', label: 'Messages', icon: <MessageSquare size={18} /> },
  { to: 'announcements', label: 'Announcements', icon: <Megaphone size={18} /> },
  { to: 'profile', label: 'Profile', icon: <User size={18} /> },
];

export default function TeacherLayout() {
  return (
    <DashboardLayout title="Teacher Portal" navItems={navItems} basePath="/teacher">
      <Outlet />
    </DashboardLayout>
  );
}
