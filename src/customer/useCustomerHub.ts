import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../shared/api';
import type { HubResponse, JoinRequest, JoinResponse, OfferResponse } from '../shared/contracts';

const CUSTOMER_KEY = 'bakeria.customerId';

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(CUSTOMER_KEY, id);
    else localStorage.removeItem(CUSTOMER_KEY);
  } catch { /* The current visit still works when browser storage is unavailable. */ }
}

function initialCustomer(): string | null {
  const match = window.location.pathname.match(/^\/hub\/([^/]+)\/?$/);
  if (match) {
    try { return decodeURIComponent(match[1]); } catch { return null; }
  }
  try { return localStorage.getItem(CUSTOMER_KEY) || null; } catch { return null; }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function useCustomerHub() {
  const [customerId, setCustomerId] = useState(initialCustomer);
  const [hub, setHub] = useState<HubResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(customerId));
  const [busy, setBusy] = useState<string | null>(null);
  const [readError, setReadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const session = useRef(0);
  const activeId = useRef(customerId);
  const actionLock = useRef(false);
  const readController = useRef<AbortController | null>(null);
  const refreshRef = useRef<() => Promise<boolean>>(async () => false);

  const selectCustomer = useCallback((id: string | null) => {
    if (id !== null && id === activeId.current) return;
    session.current += 1;
    activeId.current = id;
    actionLock.current = false;
    readController.current?.abort();
    setHub(null); setReadError(''); setActionError(''); setNotice(''); setBusy(null);
    setLoading(Boolean(id)); setCustomerId(id); remember(id);
  }, []);

  const switchCustomer = useCallback(() => {
    selectCustomer(null);
    window.history.replaceState(null, '', '/hub');
  }, [selectCustomer]);

  useEffect(() => {
    const onNavigation = () => selectCustomer(initialCustomer());
    window.addEventListener('popstate', onNavigation);
    return () => window.removeEventListener('popstate', onNavigation);
  }, [selectCustomer]);

  useEffect(() => {
    if (!customerId) return;
    let disposed = false;
    const currentSession = session.current;
    const current = () => !disposed && currentSession === session.current && activeId.current === customerId;
    let requestNumber = 0;
    let inFlight: Promise<boolean> | null = null;

    function fetchHub(force = false): Promise<boolean> {
      // Polls share a pending read; mutation refetches replace any older snapshot.
      if (inFlight && !force) return inFlight;
      const request = ++requestNumber;
      readController.current?.abort();
      const controller = new AbortController();
      readController.current = controller;
      const promise = api<HubResponse>(`/hub/${encodeURIComponent(customerId!)}`, { signal: controller.signal })
        .then(response => {
          if (!current() || request !== requestNumber) return false;
          if (response.customer.id !== customerId) throw new Error('This card could not be verified. Please try again.');
          setHub(response); setReadError(''); remember(customerId);
          return true;
        }).catch(cause => {
          if (!current() || request !== requestNumber || controller.signal.aborted) return false;
          // The frozen shared transport exposes the server error message, not its status.
          if (message(cause) === 'Customer not found') {
            switchCustomer();
            setNotice('That saved card is no longer available. Enter your phone number to find or start a card.');
          } else setReadError(`Couldn’t refresh your card. ${message(cause)}`);
          return false;
        }).finally(() => {
          if (current() && request === requestNumber) { inFlight = null; setLoading(false); }
        });
      inFlight = promise;
      return promise;
    }

    refreshRef.current = () => fetchHub(true);
    void fetchHub();
    let interval: ReturnType<typeof setInterval> | null = null;
    const stopPolling = () => { if (interval !== null) clearInterval(interval); interval = null; };
    const startPolling = () => {
      stopPolling();
      if (document.visibilityState === 'visible') interval = setInterval(() => { void fetchHub(); }, 2000);
    };
    const onVisibility = () => { startPolling(); if (document.visibilityState === 'visible') void fetchHub(true); };
    const onFocus = () => { if (document.visibilityState === 'visible') void fetchHub(true); };
    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      disposed = true; stopPolling(); readController.current?.abort();
      refreshRef.current = async () => false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [customerId, switchCustomer]);

  useEffect(() => () => { session.current += 1; readController.current?.abort(); }, []);

  async function join(phone: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    const currentSession = session.current;
    setBusy('join'); setActionError(''); setNotice('');
    try {
      const body: JoinRequest = { phone };
      const response = await api<JoinResponse>('/hub/join', { method: 'POST', body: JSON.stringify(body) });
      if (session.current !== currentSession) return;
      selectCustomer(response.customer.id);
    } catch (cause) {
      if (session.current === currentSession) setActionError(`Couldn’t find your card. ${message(cause)}`);
    } finally {
      if (session.current === currentSession) { actionLock.current = false; setBusy(null); }
    }
  }

  async function redeemOffer(offerId: string) {
    const id = activeId.current;
    if (!id || actionLock.current || !hub || hub.customer.id !== id) return;
    if (!hub.offers.some(offer => offer.id === offerId && offer.customer_id === id && offer.status === 'approved')) return;
    actionLock.current = true;
    const currentSession = session.current;
    setBusy(`offer:${offerId}`);
    setActionError(''); setNotice(''); readController.current?.abort();
    try {
      const response = await api<OfferResponse>(`/offers/${encodeURIComponent(offerId)}/redeem`, { method: 'POST', body: '{}' });
      if (session.current !== currentSession) return;
      setHub(previous => previous?.customer.id === id ? { ...previous, offers: previous.offers.map(offer => offer.id === response.offer.id ? response.offer : offer) } : previous);
      setNotice('Offer marked used in the demo. No payment was made or stamps added.');
      await refreshRef.current();
    } catch (cause) {
      if (session.current === currentSession) setActionError(`Couldn’t redeem this offer. ${message(cause)}`);
    } finally {
      if (session.current === currentSession) { actionLock.current = false; setBusy(null); }
    }
  }

  return { customerId, hub, loading, busy, error: actionError || readError, notice, join, switchCustomer,
    refresh: () => refreshRef.current(), redeemOffer };
}
