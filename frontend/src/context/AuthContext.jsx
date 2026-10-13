import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState({ unread: 0, items: [] });
  const [notifLoading, setNotifLoading] = useState(false);

  // Check existing session
  const checkAuth = useCallback(async () => {
    try {
      const data = await apiRequest('/api/auth/me');
      setUser(data);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setNotifLoading(true);
      const data = await apiRequest('/api/notifications');
      setNotifications(data || { unread: 0, items: [] });
    } catch (err) {
      console.warn('Failed to fetch notifications', err);
    } finally {
      setNotifLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Polling for notifications when logged in
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  const login = async (phone, pin) => {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { phone, pin },
    });
    setUser(data);
    return data;
  };

  const signup = async (name, phone, pin) => {
    const data = await apiRequest('/api/auth/signup', {
      method: 'POST',
      body: { name, phone, pin },
    });
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', body: {} });
    } catch (err) {
      // ignore
    } finally {
      setUser(null);
      setNotifications({ unread: 0, items: [] });
    }
  };

  const updateProfile = async (updates) => {
    const updated = await apiRequest('/api/auth/me', {
      method: 'PUT',
      body: updates,
    });
    setUser(updated);
    return updated;
  };

  const markNotificationRead = async (id) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) => ({
        unread: Math.max(0, prev.unread - 1),
        items: prev.items.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/read', { method: 'POST' });
      setNotifications((prev) => ({
        unread: 0,
        items: prev.items.map((n) => ({ ...n, read_at: new Date().toISOString() })),
      }));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        updateProfile,
        notifications,
        fetchNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
