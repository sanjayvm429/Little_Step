import { FormEvent, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera, Check, Copy, Link2, Pencil, ShieldCheck, Trash2, UserPlus, X,
} from 'lucide-react';
import FaceCapturePanel, {
  emptyFaceValidation,
  FaceImages,
  FacePosition,
  FaceValidation,
} from '../../components/FaceCapturePanel';
import api, { getErrorMessage } from '../../services/api';

interface Employee {
  employee_id: string;
  full_name: string;
  email: string;
  department: string;
  designation: string;
  contact_number?: string;
  registration_date: string;
  status: 'active' | 'inactive';
  consent_given: boolean;
  face_positions: FacePosition[];
  has_all_faces: boolean;
}

interface EmployeeFields {
  employee_id: string;
  full_name: string;
  email: string;
  department: string;
  designation: string;
  contact_number: string;
  registration_date: string;
}

interface RegistrationLink {
  registration_url: string;
  expires_at: string;
  employee_id: string;
}

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const emptyFields = (): EmployeeFields => ({
  employee_id: '',
  full_name: '',
  email: '',
  department: '',
  designation: '',
  contact_number: '',
  registration_date: today(),
});

const requiredFields: (keyof EmployeeFields)[] = [
  'employee_id', 'full_name', 'email', 'department', 'designation', 'registration_date',
];

function isComplete(images: FaceImages, validation: FaceValidation) {
  return (['front', 'left', 'right'] as FacePosition[]).every(
    (position) => images[position] && validation[position] === 'valid',
  );
}

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fields, setFields] = useState<EmployeeFields>(emptyFields);
  const [images, setImages] = useState<FaceImages>({});
  const [validation, setValidation] = useState<FaceValidation>(emptyFaceValidation);
  const [consent, setConsent] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editFields, setEditFields] = useState<EmployeeFields>(emptyFields);
  const [faceTarget, setFaceTarget] = useState<Employee | null>(null);
  const [faceImages, setFaceImages] = useState<FaceImages>({});
  const [faceValidation, setFaceValidation] = useState<FaceValidation>(emptyFaceValidation);
  const [link, setLink] = useState<RegistrationLink | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [facePreview, setFacePreview] = useState<{ employee: Employee; position: FacePosition; url: string } | null>(null);

  const loadEmployees = async () => {
    try {
      const response = await api.get('/face/employees', {
        params: { search: search || undefined },
      });
      setEmployees(response.data.employees);
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, [search]);

  useEffect(() => () => {
    if (facePreview) URL.revokeObjectURL(facePreview.url);
  }, [facePreview]);

  const updateField = (key: keyof EmployeeFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const validateDetails = () => {
    if (requiredFields.some((key) => !fields[key].trim())) {
      setError('Complete all required employee details before continuing.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
      setError('Enter a valid email address.');
      return false;
    }
    if (!consent) {
      setError('Confirm that the employee has consented before collecting face data.');
      return false;
    }
    return true;
  };

  const buildRegistrationForm = (employeeFields: EmployeeFields, faceSet: FaceImages) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(employeeFields)) {
      if (value) form.append(key, value);
    }
    form.append('consent_given', 'true');
    for (const position of ['front', 'left', 'right'] as FacePosition[]) {
      const file = faceSet[position];
      if (file) form.append(`${position}_image`, file);
    }
    return form;
  };

  const registerEmployee = async (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    setError('');
    if (!validateDetails()) return;
    if (!isComplete(images, validation)) {
      setError('Upload or capture and validate one face image for each position.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/face/employees', buildRegistrationForm(fields, images));
      setNotice(`Registered ${fields.full_name}.`);
      setFields(emptyFields());
      setImages({});
      setValidation(emptyFaceValidation);
      setConsent(false);
      await loadEmployees();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const createMobileLink = async (mode: 'new_employee' | 'reregister', employee?: Employee) => {
    setError('');
    setNotice('');
    if (mode === 'new_employee' && !validateDetails()) return;
    const data = mode === 'new_employee'
      ? { ...fields, consent_given: true, mode }
      : { employee_id: employee!.employee_id, mode, consent_given: true };
    setSaving(true);
    try {
      const response = await api.post('/face/registration-links', data);
      const newLink: RegistrationLink = {
        registration_url: response.data.registration_url,
        expires_at: response.data.expires_at,
        employee_id: response.data.employee_id,
      };
      setLink(newLink);
      setQrDataUrl(await QRCode.toDataURL(newLink.registration_url, { width: 240, margin: 1 }));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const saveEmployee = async (event: FormEvent) => {
    event.preventDefault();
    if (!editEmployee) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/face/employees/${encodeURIComponent(editEmployee.employee_id)}`, {
        full_name: editFields.full_name,
        email: editFields.email,
        department: editFields.department,
        designation: editFields.designation,
        contact_number: editFields.contact_number,
        registration_date: editFields.registration_date,
      });
      setEditEmployee(null);
      setNotice('Employee details updated.');
      await loadEmployees();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const toggleEmployee = async (employee: Employee) => {
    setError('');
    try {
      await api.put(`/face/employees/${encodeURIComponent(employee.employee_id)}`, {
        status: employee.status === 'active' ? 'inactive' : 'active',
      });
      await loadEmployees();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  const saveFaceUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!faceTarget || !isComplete(faceImages, faceValidation)) {
      setError('Validate front, left, and right images before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.put(
        `/face/employees/${encodeURIComponent(faceTarget.employee_id)}/faces`,
        buildRegistrationForm(emptyFields(), faceImages),
      );
      setFaceTarget(null);
      setFaceImages({});
      setFaceValidation(emptyFaceValidation);
      setNotice(`Face images updated for ${faceTarget.full_name}.`);
      await loadEmployees();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const removeFaceData = async (employee: Employee) => {
    if (!confirm(`Delete all stored face data for ${employee.full_name}? The employee record will remain.`)) return;
    try {
      await api.delete(`/face/employees/${encodeURIComponent(employee.employee_id)}/face-data`);
      await loadEmployees();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  const showFaceImage = async (employee: Employee, position: FacePosition) => {
    try {
      const response = await api.get(
        `/face/employees/${encodeURIComponent(employee.employee_id)}/faces/${position}`,
        { responseType: 'blob' },
      );
      if (facePreview) URL.revokeObjectURL(facePreview.url);
      setFacePreview({ employee, position, url: URL.createObjectURL(response.data) });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.registration_url);
      setNotice('Registration link copied.');
    } catch {
      setError('Could not access the clipboard. Copy the link from the field instead.');
    }
  };

  const fieldInputs = (values: EmployeeFields, onChange: (key: keyof EmployeeFields, value: string) => void, includeId = true) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {includeId && <label className="label">Employee ID<input className="input mt-1" required maxLength={64} value={values.employee_id} onChange={(event) => onChange('employee_id', event.target.value)} /></label>}
      <label className="label">Employee name<input className="input mt-1" required maxLength={120} value={values.full_name} onChange={(event) => onChange('full_name', event.target.value)} /></label>
      <label className="label">Email address<input className="input mt-1" type="email" required maxLength={254} value={values.email} onChange={(event) => onChange('email', event.target.value)} /></label>
      <label className="label">Department<input className="input mt-1" required maxLength={100} value={values.department} onChange={(event) => onChange('department', event.target.value)} /></label>
      <label className="label">Designation<input className="input mt-1" required maxLength={100} value={values.designation} onChange={(event) => onChange('designation', event.target.value)} /></label>
      <label className="label">Contact number (optional)<input className="input mt-1" type="tel" maxLength={32} value={values.contact_number} onChange={(event) => onChange('contact_number', event.target.value)} /></label>
      <label className="label">Registration date<input className="input mt-1" type="date" required value={values.registration_date} onChange={(event) => onChange('registration_date', event.target.value)} /></label>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Register User</h2>
          <p className="mt-1 text-sm text-slate-400">Create an employee profile and register three face angles.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck size={16} className="text-emerald-400" /> Face data is encrypted and admin-only
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

      <form className="card space-y-5" onSubmit={registerEmployee}>
        <div className="flex items-center gap-2">
          <UserPlus size={18} className="text-sky-400" />
          <h3 className="font-semibold text-slate-100">Employee details</h3>
        </div>
        {fieldInputs(fields, updateField)}
        <label className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <input type="checkbox" className="mt-1 accent-sky-500" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          I confirm the employee has consented to face data collection and processing for attendance.
        </label>
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-100">Three face images</h3>
          <FaceCapturePanel images={images} setImages={setImages} validation={validation} setValidation={setValidation} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" type="submit" disabled={saving}>
            <Check size={15} /> {saving ? 'Registering…' : 'Register employee'}
          </button>
          <button className="btn-secondary" type="button" disabled={saving} onClick={() => void createMobileLink('new_employee')}>
            <Link2 size={15} /> Register using mobile
          </button>
        </div>
      </form>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-100">Employee list</h3>
            <p className="text-xs text-slate-400">{employees.length} employee(s)</p>
          </div>
          <input className="input max-w-xs" placeholder="Search employees…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-slate-700 text-left text-xs text-slate-400">
              <tr>
                <th className="px-3 py-3">Employee</th><th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Faces</th><th className="px-3 py-3">Registration</th>
                <th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading employees…</td></tr>}
              {!loading && employees.map((employee) => (
                <tr key={employee.employee_id} className="hover:bg-slate-900/60">
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-200">{employee.full_name}</div>
                    <div className="text-xs text-slate-500">{employee.employee_id} · {employee.email}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{employee.department}<div className="text-xs text-slate-500">{employee.designation}</div></td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {(['front', 'left', 'right'] as FacePosition[]).map((position) => (
                        <button key={position} type="button" disabled={!employee.face_positions.includes(position)} onClick={() => void showFaceImage(employee, position)} className={`rounded border px-2 py-1 text-[10px] ${employee.face_positions.includes(position) ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-800 text-slate-600'}`}>
                          {position}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{employee.registration_date}</td>
                  <td className="px-3 py-3"><span className={`badge ${employee.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>{employee.status}</span></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <button type="button" title="Edit details" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-sky-300" onClick={() => { setEditEmployee(employee); setEditFields({ employee_id: employee.employee_id, full_name: employee.full_name, email: employee.email, department: employee.department, designation: employee.designation, contact_number: employee.contact_number ?? '', registration_date: employee.registration_date }); }}><Pencil size={14} /></button>
                      <button type="button" title="Update face images" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-sky-300" onClick={() => { setFaceTarget(employee); setFaceImages({}); setFaceValidation(emptyFaceValidation); }}><Camera size={14} /></button>
                      <button type="button" title="Create mobile re-registration link" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-sky-300" onClick={() => void createMobileLink('reregister', employee)}><Link2 size={14} /></button>
                      <button type="button" title={employee.status === 'active' ? 'Deactivate' : 'Activate'} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-amber-300" onClick={() => void toggleEmployee(employee)}><ShieldCheck size={14} /></button>
                      <button type="button" title="Delete face data" className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300" onClick={() => void removeFaceData(employee)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && employees.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No employees found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {faceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={saveFaceUpdate} className="card max-h-[90vh] w-full max-w-4xl space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div><h3 className="font-semibold text-slate-100">Update face images</h3><p className="text-xs text-slate-400">{faceTarget.full_name} · {faceTarget.employee_id}</p></div>
              <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" onClick={() => setFaceTarget(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <FaceCapturePanel images={faceImages} setImages={setFaceImages} validation={faceValidation} setValidation={setFaceValidation} />
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save new face images'}</button>
          </form>
        </div>
      )}

      {editEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={saveEmployee} className="card w-full max-w-3xl space-y-4">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-100">Edit employee details</h3><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" onClick={() => setEditEmployee(null)} aria-label="Close"><X size={18} /></button></div>
            <div className="text-xs text-slate-500">Employee ID: {editEmployee.employee_id}</div>
            {fieldInputs(editFields, (key, value) => setEditFields((current) => ({ ...current, [key]: value })), false)}
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </form>
        </div>
      )}

      {link && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card w-full max-w-lg space-y-4">
            <div className="flex items-start justify-between"><div><h3 className="font-semibold text-slate-100">Mobile face registration</h3><p className="mt-1 text-xs text-slate-400">Employee {link.employee_id} · Expires {new Date(link.expires_at).toLocaleString()}</p></div><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" onClick={() => setLink(null)} aria-label="Close"><X size={18} /></button></div>
            <div className="flex justify-center rounded-xl bg-white p-3">{qrDataUrl && <img src={qrDataUrl} alt="QR code for secure mobile registration" className="h-56 w-56" />}</div>
            <label className="label">Secure registration link<div className="mt-1 flex gap-2"><input className="input min-w-0" readOnly value={link.registration_url} /><button type="button" className="btn-secondary shrink-0" onClick={() => void copyLink()}><Copy size={14} />Copy</button></div></label>
            <p className="text-xs text-amber-300">This single-use link contains a private token. Share it only with the intended employee.</p>
          </div>
        </div>
      )}

      {facePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setFacePreview(null)}>
          <div className="card w-full max-w-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-slate-100">{facePreview.employee.full_name}</h3><p className="text-xs text-slate-400">{facePreview.position} face image</p></div><button type="button" onClick={() => setFacePreview(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Close"><X size={18} /></button></div>
            <img src={facePreview.url} alt={`${facePreview.position} face for ${facePreview.employee.full_name}`} className="max-h-[70vh] w-full rounded-xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
