import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from './Modal';
import { CreditCard, User, Phone, Check } from 'lucide-react';

export default function ProfileModal({ isOpen, onClose }) {
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setUpiId(user.upi_id || '');
    }
  }, [user, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile({
        name: name.trim(),
        upi_id: upiId.trim(),
      });
      showToast('Profile updated successfully!', 'success');
      onClose();
    } catch (err) {
      showToast(err.message || 'Error updating profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Profile & Payment Details">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="profile-phone">Registered Phone</label>
          <div style={{ position: 'relative' }}>
            <input
              id="profile-phone"
              type="text"
              className="form-control"
              value={`+91 ${user.phone}`}
              disabled
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
            />
            <Phone
              size={17}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }}
            />
          </div>
          <div className="form-hint">Phone number is fixed for your account.</div>
        </div>

        <div className="form-group">
          <label htmlFor="profile-name">Display Name</label>
          <div style={{ position: 'relative' }}>
            <input
              id="profile-name"
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
            />
            <User
              size={17}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="profile-upi">UPI Virtual Payment Address (VPA)</label>
          <div style={{ position: 'relative' }}>
            <input
              id="profile-upi"
              type="text"
              className="form-control mono"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. yourname@okaxis or 9876543210@paytm"
            />
            <CreditCard
              size={17}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }}
            />
          </div>
          <div className="form-hint">
            Adding your UPI ID generates 1-click payment links when roommates settle debts with you.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
