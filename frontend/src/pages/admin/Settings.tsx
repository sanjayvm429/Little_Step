import { useAuth } from '../../context/AuthContext';

export default function AdminSettings() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">Nursery configuration</p>
      </div>
      <div className="card max-w-lg space-y-4">
        <div>
          <label className="label">Admin name</label>
          <input className="input" defaultValue={user?.fullName} disabled />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" defaultValue={user?.email} disabled />
        </div>
        <div>
          <label className="label">Nursery name</label>
          <input className="input" defaultValue="LittleSteps Nursery" />
        </div>
        <p className="text-xs text-slate-400">Advanced settings (camera providers, notification integrations) will be configurable here.</p>
      </div>
    </div>
  );
}
