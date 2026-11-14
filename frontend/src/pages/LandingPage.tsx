import { Link } from 'react-router-dom';
import { Baby, Camera, Bell, ShieldCheck, Users, Clock, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary text-white">
              <Baby size={20} />
            </div>
            <span className="text-xl font-bold text-slate-900">LittleSteps</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="hover:text-brand-primary">Features</a>
            <a href="#how" className="hover:text-brand-primary">How it works</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="btn-secondary">Log in</Link>
            <Link to="/signup" className="btn-primary">Get started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full bg-brand-purple/20 px-4 py-1.5 text-sm font-medium text-purple-700">
          <ShieldCheck size={16} /> Secure childcare monitoring
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
          Watch your little ones{' '}
          <span className="text-brand-primary">grow, safely</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          LittleSteps connects nurseries, teachers and parents through secure live camera monitoring,
          real-time attendance, daily activity updates and peace of mind.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link to="/signup" className="btn-primary px-6 py-3 text-base">
            Create free account <ArrowRight size={18} />
          </Link>
          <Link to="/login" className="btn-secondary px-6 py-3 text-base">I have an account</Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold text-slate-900">Everything parents & nurseries need</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: Camera, title: 'Live camera monitoring', desc: 'Secure WebRTC streams from authorized classroom cameras. Privacy-first, permission-controlled.', color: 'bg-brand-blue/30 text-sky-600' },
              { icon: Clock, title: 'Real-time attendance', desc: 'Check-in/check-out tracking with instant parent notifications.', color: 'bg-brand-green/30 text-emerald-600' },
              { icon: Bell, title: 'Daily activity updates', desc: 'Meals, naps, learning and play — teachers share it all with parents instantly.', color: 'bg-brand-pink/30 text-pink-600' },
              { icon: Users, title: 'Role-based access', desc: 'Parents, teachers and admins each see exactly what they should.', color: 'bg-brand-purple/30 text-purple-600' },
              { icon: ShieldCheck, title: 'Child safety first', desc: 'Pickup authorization, incident reporting and encrypted camera credentials.', color: 'bg-amber-100 text-amber-600' },
              { icon: Baby, title: 'Built for little ones', desc: 'Designed for play schools, daycares, preschools and kindergartens.', color: 'bg-rose-100 text-rose-600' },
            ].map((f) => (
              <div key={f.title} className="card">
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${f.color}`}>
                  <f.icon size={22} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold text-slate-900">How it works</h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {[
            { step: '1', title: 'Nursery onboards', desc: 'Admin creates classrooms, registers teachers and sets up cameras.' },
            { step: '2', title: 'Parents connect', desc: 'Parents sign up and request access to their child using the admission number.' },
            { step: '3', title: 'Stay connected', desc: 'Watch live streams, get attendance alerts and follow daily activities.' },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-lg font-bold text-white">{s.step}</div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-100 bg-brand-purple/10 py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-slate-900">Ready to get started?</h2>
          <p className="mt-3 text-slate-600">Join nurseries and parents who trust LittleSteps every day.</p>
          <Link to="/signup" className="btn-primary mt-6 px-8 py-3 text-base">Create your account</Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} LittleSteps. Smart Nursery & Childcare Monitoring Platform.
      </footer>
    </div>
  );
}
