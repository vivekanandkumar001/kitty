// Centralized API client for Kitty
const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export async function apiRequest(endpoint, options = {}) {
  const config = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // send session cookies across requests
    ...options,
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, config);

  if (res.status === 204) {
    return null;
  }

  // Handle blob responses (like CSV exports)
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    const blob = await res.blob();
    return blob;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    data = { error: res.statusText || 'Unexpected server response' };
  }

  if (!res.ok) {
    const errorMsg = data.error || (typeof data === 'string' ? data : 'Something went wrong');
    const error = new Error(errorMsg);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const DEFAULT_CURRENCY_SYMBOL = import.meta.env.VITE_CURRENCY_SYMBOL || '₹';

export function formatMoney(minorAmount, symbol = DEFAULT_CURRENCY_SYMBOL) {
  const rupees = (Number(minorAmount || 0) / 100);
  return symbol + rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatRupees(rupeesAmount, symbol = DEFAULT_CURRENCY_SYMBOL) {
  return symbol + Number(rupeesAmount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
