'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';

interface User {
  id: string;
  name: string | null;
  email: string;
  role: 'ADMIN' | 'APPROVER' | 'VIEWER';
}

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  user: User | null; // null for create, User for edit
}

export function UserFormModal({ isOpen, onClose, onSave, user }: UserFormModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'APPROVER' | 'VIEWER'>('VIEWER');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!user;

  // Reset form when modal opens/closes or user changes
  useEffect(() => {
    if (isOpen) {
      if (user) {
        setName(user.name || '');
        setEmail(user.email);
        setRole(user.role);
        setPassword('');
      } else {
        setName('');
        setEmail('');
        setPassword('');
        setRole('VIEWER');
      }
      setError(null);
    }
  }, [isOpen, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!isEditing && !password.trim()) {
      setError('Password is required for new users');
      return;
    }

    if (!isEditing && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      setSaving(true);

      const url = isEditing ? `/api/users/${user.id}` : '/api/users';
      const method = isEditing ? 'PUT' : 'POST';

      const body: any = {
        name: name.trim() || null,
        role,
      };

      if (!isEditing) {
        body.email = email.trim();
        body.password = password;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to ${isEditing ? 'update' : 'create'} user`);
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Edit User' : 'Create User'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="John Doe"
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isEditing}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="john@example.com"
              required
            />
            {isEditing && (
              <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
            )}
          </div>

          {/* Password (only for create) */}
          {!isEditing && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Minimum 8 characters"
                minLength={8}
                required
              />
            </div>
          )}

          {/* Role */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="VIEWER">Viewer - Read-only access</option>
              <option value="APPROVER">Approver - Can approve/reject invoices</option>
              <option value="ADMIN">Admin - Full system access</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
