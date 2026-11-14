import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, Camera, CalendarCheck, Activity,
  Bell, MessageSquare, Image as ImageIcon, KeyRound, Settings,
} from 'lucide-react';
import DashboardLayout, { NavItem } from './DashboardLayout';

const navItems: NavItem[] = [
  { to: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={18} /> },
  { to: 'children', label: 'My Children', icon: <Users size={18} /> },
  { to: 'live', label: 'Live Monitoring', icon: <Camera size={18} /> },
  { to: 'attendance', label: 'Attendance', icon: <CalendarCheck size={18} /> },
  { to: 'activities', label: 'Daily Activities', icon: <Activity size={18} /> },
  { to: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
  { to: 'messages', label: 'Messages', icon: <MessageSquare size={18} /> },
  { to: 'photos', label: 'Photo Gallery', icon: <ImageIcon size={18} /> },
  { to: 'pickup', label: 'Pickup Authorization', icon: <KeyRound size={18} /> },
  { to: 'settings', label: 'Settings', icon: <Settings size={18} /> },
];

export default function ParentLayout() {
  return (
    <DashboardLayout title="Parent Portal" navItems={navItems} basePath="/parent">
      <Outlet />
    </DashboardLayout>
  );
}
