import { useEffect, useState } from 'react';
import type { Offer } from '../shared/contracts';
import { client } from './client';
import { errorMessage, firstName, formatDateTime } from './format';

interface Props { customerId: string; customerName: string; offers: Offer[]; onChanged: () => void; }
type Pending = 'draft' | 'save' | 'approve' | null;
const MAX = 280;

// Draft → edit → Save → Approve. Save (PATCH) must succeed before approval (POST); on failure
// the edits stay in the textarea with an actionable error. Approval only previews in the hub.
export default function OfferPanel({ customerId, customerName, offers, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [latest, setLatest] = useState<Offer | null>(null); // newest server-confirmed state of the edited offer
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState('');

  // After each refetch, trust the server copy of the offer being edited.
  useEffect(() => {
    if (!editingId) return;
    const fromServer = offers.find(o => o.id === editingId);
    if (fromServer) setLatest(fromServer);
  }, [offers, editingId]);

  const trimmed = text.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= MAX;
  const dirty = latest !== null && trimmed !== latest.message;
  const first = firstName(customerName);

  function startEditing(offer: Offer) {
    setEditingId(offer.id); setLatest(offer); setText(offer.message); setError('');
  }

  async function draft() {
    setPending('draft'); setError('');
    try {
      const { offer } = await client.draftOffer(customerId);
      startEditing(offer);
      onChanged();
    } catch (e) {
      setError(`Couldn’t draft an offer: ${errorMessage(e)}. Try again.`);
    } finally { setPending(null); }
  }

  async function save() {
    if (!latest || !valid || !dirty) return;
    setPending('save'); setError('');
    try {
      const { offer } = await client.saveOffer(latest.id, trimmed);
      setLatest(offer); setText(offer.message);
      onChanged();
    } catch (e) {
      setError(`Save failed: ${errorMessage(e)}. Your edits are kept; adjust the message and try again.`);
    } finally { setPending(null); }
  }

  async function approve() {
    if (!latest || !valid) return;
    setPending('approve'); setError('');
    let step: 'save' | 'approve' = dirty ? 'save' : 'approve';
    try {
      if (dirty) {
        const saved = await client.saveOffer(latest.id, trimmed);
        setLatest(saved.offer); setText(saved.offer.message);
        step = 'approve';
      }
      const approved = await client.approveOffer(latest.id);
      setLatest(approved.offer);
      onChanged();
    } catch (e) {
      setError(step === 'save'
        ? `Save failed, so nothing was approved: ${errorMessage(e)}. Your edits are kept; fix the message and try again.`
        : `Approval failed: ${errorMessage(e)}. The saved draft is unchanged; try approving again.`);
    } finally { setPending(null); }
  }

  const editor = latest && editingId === latest.id ? latest : null;

  return <section className="dashboard-offers" aria-labelledby="dashboard-offers-heading">
    <div className="dashboard-section-head">
      <h2 id="dashboard-offers-heading">Personal offers</h2>
      <button type="button" className="dashboard-primary" onClick={draft} disabled={pending !== null}>
        {pending === 'draft' ? 'Drafting…' : 'Draft a personal offer'}
      </button>
    </div>
    <p className="dashboard-muted">
      Drafts use {first}’s real order history. You edit and approve; approval only previews the offer in {first}’s customer hub. Nothing is texted or emailed.
    </p>

    {editor && editor.status === 'draft' && <form className="dashboard-editor" onSubmit={e => { e.preventDefault(); void save(); }}>
      <p className="dashboard-offer-meta"><StatusBadge status={editor.status} /> <SourceBadge source={editor.source} /> <span className="dashboard-muted">{formatDateTime(editor.created_at)}</span></p>
      <label className="dashboard-field">
        <span>Offer message</span>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4} disabled={pending !== null} aria-describedby="dashboard-offer-help" />
      </label>
      <p id="dashboard-offer-help" className={`dashboard-small ${valid ? 'dashboard-muted' : 'dashboard-error'}`}>
        {trimmed.length} / {MAX} characters{dirty ? ' · Unsaved changes' : ' · Saved'}{!valid && (trimmed.length === 0 ? ' · Message can’t be empty' : ' · Too long')}
      </p>
      <p className="dashboard-benefit">Benefit: <strong>a free topping with the next parfait</strong>. That is the only offer tonight; the text shouldn’t promise anything else.</p>
      <div className="dashboard-actions">
        <button type="submit" disabled={!valid || !dirty || pending !== null}>{pending === 'save' ? 'Saving…' : 'Save draft'}</button>
        <button type="button" className="dashboard-primary" onClick={approve} disabled={!valid || pending !== null}>
          {pending === 'approve' ? 'Approving…' : dirty ? 'Save and approve · preview in hub' : 'Approve · preview in hub'}
        </button>
        <button type="button" onClick={() => { setEditingId(null); setLatest(null); setError(''); }} disabled={pending !== null}>Close</button>
      </div>
      {error && <p className="dashboard-error" role="alert">{error}</p>}
    </form>}

    {editor && editor.status !== 'draft' && <p className="dashboard-success" role="status">
      {editor.status === 'approved' ? 'Approved.' : 'Redeemed.'} {first} sees this exact message in the customer hub:
      <q className="dashboard-quote">{editor.message}</q>
    </p>}
    {!editor && error && <p className="dashboard-error" role="alert">{error}</p>}

    {offers.length === 0
      ? <p className="dashboard-muted">No offers yet for {first}.</p>
      : <ul className="dashboard-offer-list">
        {offers.map(offer => <li key={offer.id} className={`dashboard-offer dashboard-offer-${offer.status}`}>
          <p className="dashboard-offer-meta"><StatusBadge status={offer.status} /> <SourceBadge source={offer.source} /> <span className="dashboard-muted">{formatDateTime(offer.created_at)}</span></p>
          <p className="dashboard-offer-message">{offer.message}</p>
          {offer.status === 'draft' && offer.id !== editingId &&
            <button type="button" onClick={() => startEditing(offer)} disabled={pending !== null}>Edit this draft</button>}
        </li>)}
      </ul>}
  </section>;
}

function StatusBadge({ status }: { status: Offer['status'] }) {
  const label = status === 'draft' ? 'Draft · hidden from customer' : status === 'approved' ? 'Approved · visible in hub' : 'Redeemed';
  return <span className={`dashboard-badge dashboard-status-${status}`}>{label}</span>;
}

function SourceBadge({ source }: { source: Offer['source'] }) {
  return <span className={`dashboard-badge dashboard-badge-quiet dashboard-source-${source}`} title={source === 'ai' ? 'Generated by the model for this customer' : 'Cached fallback text; the model was unavailable or not configured'}>
    {source === 'ai' ? 'AI-drafted' : 'Cached fallback'}
  </span>;
}
