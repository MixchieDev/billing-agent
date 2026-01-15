'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserFormModal } from './user-form-modal';
import { ChangePasswordModal } from './change-password-modal';
import { RefreshCw, Plus, Edit, Trash2, Key, Loader2 } from 'lucide-react';

interface User {
  id: string;
  name: string | null;
  email: string;
  role: 'ADMIN' | 'APPROVER' | 'VIEWER';
  createdAt: string;
}

export function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/users');
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You do not have permission to view users');
        }
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = () => {
    setEditingUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleChangePassword = (userId: string) => {
    setPasswordUserId(userId);
    setShowPasswordModal(true);
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete ${user.name || user.email}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      await fetchUsers();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, 'default' | 'success' | 'secondary'> = {
      ADMIN: 'default',
      APPROVER: 'success',
      VIEWER: 'secondary',
    };
    return <Badge variant={variants[role] || 'secondary'}>{role}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Check if current user is admin
  const isAdmin = session?.user?.role === 'ADMIN';

  if (!isAdmin) {
    return (
      <div className="flex flex-col">
        <Header title="Users" subtitle="Manage system users" />
        <div className="flex-1 p-6">
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            You do not have permission to access this page.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header title="Users" subtitle="Manage system users and permissions" />

      <div className="flex-1 space-y-6 p-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            User List
            {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({users.length} user{users.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleCreateUser}>
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {/* Users Table */}
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name || '-'}
                      {user.id === session?.user?.id && (
                        <span className="ml-2 text-xs text-gray-400">(you)</span>
                      )}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          title="Edit user"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleChangePassword(user.id)}
                          title="Change password"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        {user.id !== session?.user?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(user)}
                            title="Delete user"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* User Form Modal */}
      <UserFormModal
        isOpen={showUserModal}
        onClose={() => {
          setShowUserModal(false);
          setEditingUser(null);
        }}
        onSave={fetchUsers}
        user={editingUser}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordUserId(null);
        }}
        userId={passwordUserId}
        isOwnAccount={passwordUserId === session?.user?.id}
      />
    </div>
  );
}
