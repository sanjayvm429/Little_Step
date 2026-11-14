import { useAuth } from '../../context/AuthContext';

export default function TeacherProfile() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Profile</h2>
        <p className="text-sm text-slate-500">Your account information</p>
      </div>
      <div className="card max-w-lg space-y-4">
        <div>
          <label className="label">Full name</label>
          <input className="input" defaultValue={user?.fullName} disabled />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" defaultValue={user?.email} disabled />
        </div>
        <div>
          <label className="label">Role</label>
          <input className="input capitalize" defaultValue={user?.role} disabled />
        </div>
      </div>
    </div>
  );
}
