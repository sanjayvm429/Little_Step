import { useEffect, useState, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Message, Child } from '../../types';

export default function ParentMessages() {
  const [conversations, setConversations] = useState<{ _id: string; fullName: string; role: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [conv, ch] = await Promise.all([api.get('/messages/conversations'), api.get('/children')]);
        setConversations(conv.data.conversations);
        setChildren(ch.data.children);
        if (conv.data.conversations.length > 0) setSelected(conv.data.conversations[0]._id);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      try {
        const res = await api.get('/messages', { params: { with: selected, childId: childId || undefined } });
        setMessages(res.data.messages);
      } catch { /* ignore */ }
    })();
  }, [selected, childId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!body.trim() || !selected) return;
    setError('');
    try {
      await api.post('/messages', { recipientId: selected, body, childId: childId || undefined });
      setBody('');
      const res = await api.get('/messages', { params: { with: selected, childId: childId || undefined } });
      setMessages(res.data.messages);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Messages</h2>
        <p className="text-sm text-slate-500">Communicate with your child's teacher</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Conversations */}
        <div className="card p-0">
          <div className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">Teachers</div>
          <div className="divide-y divide-slate-100">
            {conversations.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">No conversations yet.</p>}
            {conversations.map((c) => (
              <button
                key={c._id}
                onClick={() => setSelected(c._id)}
                className={`w-full px-4 py-3 text-left text-sm ${selected === c._id ? 'bg-brand-blue/20 font-medium' : 'hover:bg-slate-50'}`}
              >
                {c.fullName}
              </button>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="card flex flex-col lg:col-span-2" style={{ height: '60vh' }}>
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <MessageSquare size={18} className="text-slate-400" />
            <select className="input w-auto text-sm" value={childId} onChange={e => setChildId(e.target.value)}>
              <option value="">All children</option>
              {children.map(c => <option key={c._id} value={c._id}>{c.fullName}</option>)}
            </select>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && <p className="text-center text-sm text-slate-400">No messages yet. Say hello!</p>}
            {messages.map((m) => {
              const senderId = typeof m.sender === 'object' ? m.sender._id : m.sender;
              const mine = senderId === undefined ? false : false; // will fix below
              return null;
            })}
            {messages.map((m) => {
              const isMine = (typeof m.sender === 'object' ? m.sender._id : m.sender) !== selected;
              return (
                <div key={m._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${isMine ? 'bg-brand-primary text-white' : 'bg-slate-100 text-slate-800'}`}>
                    {typeof m.sender === 'object' && <div className="mb-0.5 text-xs opacity-70">{m.sender.fullName}</div>}
                    {m.body}
                    <div className={`mt-1 text-right text-[10px] ${isMine ? 'text-white/70' : 'text-slate-400'}`}>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          {error && <div className="px-4 pb-2 text-sm text-rose-600">{error}</div>}
          <div className="flex gap-2 border-t border-slate-100 p-3">
            <input
              className="input flex-1"
              placeholder="Type a message…"
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button onClick={send} className="btn-primary"><Send size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
