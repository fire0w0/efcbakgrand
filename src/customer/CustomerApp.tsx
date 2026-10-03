import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCustomerHub } from './useCustomerHub';
import OrderAhead from './OrderAhead';
import './customer.css';

function Flower({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
    <path d="M20 8C9-5 0 11 11 17C-5 20 3 36 15 28C16 45 33 40 27 27C43 30 45 12 30 14C37 0 21-5 20 8Z" />
    <circle cx="21" cy="20" r="4" fill="var(--paper)" />
  </svg>;
}

export default function CustomerApp() {
  const { customerId, hub, loading, busy, error, notice, join, switchCustomer, refresh, redeemOffer } = useCustomerHub();
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const visibleHub = hub?.customer.id === customerId ? hub : null;
  const offers = visibleHub?.offers.filter(offer => offer.customer_id === customerId && (offer.status === 'approved' || offer.status === 'redeemed')) ?? [];
  const feedback = <>
    {error && <div className="customer-error" role="alert"><p>{error}</p>{customerId && <button className="text-button" onClick={() => void refresh()}>Refresh card</button>}</div>}
    <div className="customer-notice" role="status" aria-live="polite">{notice}</div>
  </>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const compact = phone.trim().replace(/[\s().-]/g, '');
    if (!/^(?:\d{10}|\+?1\d{10})$/.test(compact)) {
      setPhoneError('Enter a 10-digit phone number, or include +1.');
      return;
    }
    setPhoneError('');
    await join(phone.trim());
  }

  function changeCustomer() {
    setPhone(''); setPhoneError(''); switchCustomer();
  }

  return <main className="customer">
    <div className="customer-shell">
      <header className="customer-brand">
        <Flower className="brand-flower" />
        <div><span className="brand-name">Bakeria</span><span className="brand-subtitle">Friends Forever</span></div>
        <span className="brand-note">A little sweetness.<br />A familiar face.</span>
      </header>

      {!customerId ? <>
        <section className="customer-intro">
          <p className="eyebrow">Your little corner of Bakeria</p>
          <h1>There’s always<br />a place for you.</h1>
          <p>Your stamps, a treat from Grandma, and something sweet to look forward to.</p>
        </section>
        <section className="join-card" aria-labelledby="join-title">
          <Flower className="join-flower" />
          <h2 id="join-title">Let’s find your card.</h2>
          <p>Just your phone number. No password needed.</p>
          <form onSubmit={submit} noValidate aria-busy={busy === 'join'}>
            <label htmlFor="customer-phone">Phone number</label>
            <input id="customer-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(519) 555-0125"
              value={phone} onChange={event => { setPhone(event.target.value); setPhoneError(''); }}
              aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? 'phone-error' : 'phone-hint'}
              disabled={busy === 'join'} required />
            <p id="phone-hint" className="input-hint">Canadian or US number, including the area code.</p>
            {phoneError && <p id="phone-error" className="customer-error" role="alert">{phoneError}</p>}
            <button className="primary-button" disabled={busy === 'join'}>{busy === 'join' ? 'Finding your card…' : 'Find my card'}<span aria-hidden="true">↗</span></button>
          </form>
          <p className="demo-hint">Trying the demo? Maya’s number is (519) 555-0125.</p>
        </section>
        {feedback}
      </> : <>
        <div className="customer-account">
          <p className="eyebrow">Your customer hub</p>
          <button className="text-button" onClick={changeCustomer}>Switch customer</button>
        </div>
        {feedback}
        {loading && !visibleHub && <section className="loading-card" role="status"><Flower className="loading-flower" /><h1>Finding your little<br />corner of Bakeria…</h1><p>Loading your card and offers.</p></section>}
        {visibleHub && <>
          <section className="welcome">
            <h1>Hello, {visibleHub.customer.name.split(' ')[0]}<span className="greeting-dot">.</span></h1>
            <p>Good things come to regulars.</p>
          </section>
          <section className="reward-card" aria-labelledby="reward-title">
            <div className="reward-heading"><div><p className="eyebrow">A little thank-you</p><h2 id="reward-title">Your reward card</h2></div><Flower className="card-flower" /></div>
            <ol className="stamp-grid" aria-label={`${visibleHub.customer.stamps} of ${visibleHub.reward_target} stamps collected`}>
              {Array.from({ length: visibleHub.reward_target }, (_, index) => <li key={index} className={`stamp ${index < visibleHub.customer.stamps ? 'stamp-filled' : ''}`} aria-label={`Stamp ${index + 1}: ${index < visibleHub.customer.stamps ? 'collected' : 'not yet collected'}`}>
                {index < visibleHub.customer.stamps ? <Flower /> : <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}
              </li>)}
            </ol>
            <div className="reward-progress" role="status"><strong>{visibleHub.customer.stamps} <span>/ {visibleHub.reward_target} stamps</span></strong><span>{visibleHub.customer.stamps === visibleHub.reward_target ? 'A full card. How sweet!' : `${visibleHub.reward_target - visibleHub.customer.stamps} more to your reward`}</span></div>
            <div className="reward-action"><p>{visibleHub.customer.stamps === visibleHub.reward_target ? 'Your reward is ready. Ask Grandma to redeem it at the counter.' : 'Grandma adds a stamp when you stop by.'}</p>
            </div>
          </section>
          <section className="customer-offers" aria-labelledby="offers-title">
            <div className="section-heading"><h2 id="offers-title">From Grandma, with love</h2><span className="eyebrow">Just for you</span></div>
            {offers.length === 0
              ? <div className="empty-offers"><span aria-hidden="true">♡</span><p>No little notes just yet.<br /><span>When Grandma shares a treat, you’ll find it here.</span></p></div>
              : offers.map(offer => <article className="offer-card" key={offer.id}>
                <p className="eyebrow">{offer.status === 'redeemed' ? 'Used · simulated redemption' : 'A treat from Grandma'}</p>
                <p className="offer-message">{offer.message}</p>
                {offer.status === 'approved' && <><button className="offer-button" onClick={() => redeemOffer(offer.id)} disabled={busy !== null}>{busy === `offer:${offer.id}` ? 'Redeeming…' : 'Redeem offer (demo)'}<span aria-hidden="true">↗</span></button><p className="input-hint">Simulated redemption. No payment or stamps added.</p></>}
              </article>)}
          </section>
          <OrderAhead key={visibleHub.customer.id} hub={visibleHub} onPlaced={refresh} />
        </>}
      </>}

      <footer className="customer-footer"><Flower /><p>Made with love. Shared with friends.</p><span>Demo · phone identity and redemptions are simulated.</span></footer>
    </div>
  </main>;
}
