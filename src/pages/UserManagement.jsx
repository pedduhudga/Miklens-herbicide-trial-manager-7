import React, { useState, useMemo, useEffect } from 'react';
import TopBar from '../components/TopBar.jsx';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { Users, ShieldAlert, CheckCircle, XCircle, Plus, Pencil, Trash2, X, UserCog, Leaf, Shield, Bug, Beaker, Sprout, Eye, EyeOff } from 'lucide-react';
import { CATEGORIES, DEFAULT_CATEGORY_ACCESS, ADMIN_CATEGORY_ACCESS } from '../utils/categoryConfig.js';

const ICON_MAP = { Leaf, Shield, Bug, Beaker, Sprout };

const ALL_TABS = [
  "Dashboard",
  "All Categories",
  "Large Field Trials",
  "Projects (Grouped)",
  "Plot Scanner",
  "Formulations",
  "Trials",
  "Reports & Cards",
  "Organisations",
  "Ingredient Costs",
  "AI Assistant",
  "Analytics",
  "Statistics",
  "Dose-Response (ED50)",
  "Resistance Tracker",
  "Smart Alerts",
  "Field Map",
  "Smart Search",
  "Data Management",
  "Settings",
  "Allow Downloads"
];

const emptyForm = { username: '', password: '', role: 'user', disabled: false, categoryAccess: { ...DEFAULT_CATEGORY_ACCESS }, tabPermissions: {}, viewableUsers: [], allowDataAccess: false };

export default function UserManagement({ onMenuClick }) {
  const { isAdmin, user: currentUser } = useAuth();
  const { state, updateState } = useAppState();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [fbUsers, setFbUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const firebaseEnabled = !!state.settings?.firebaseEnabled;

  const toast = (msg, type = 'success') =>
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));

  const loadFbUsers = async () => {
    if (!firebaseEnabled) return;
    setLoading(true);
    try {
      const { fbGetAllUsers } = await import('../services/firebaseAuth.js');
      const list = await fbGetAllUsers();
      const mapped = list.map(u => ({
        id: u.uid || u.ID,
        username: u.Username || u.username,
        password: u.Password || u.password || '••••••',
        role: String(u.Role || u.role || 'user').toLowerCase(),
        disabled: u.IsActive === false || u.disabled === true,
        categoryAccess: u.categoryAccess || { ...DEFAULT_CATEGORY_ACCESS },
        tabPermissions: u.tabPermissions || {},
        viewableUsers: u.viewableUsers || u.ViewableUsers || [],
        allowDataAccess: !!(u.allowDataAccess || u.AllowDataAccess)
      }));
      setFbUsers(mapped);
    } catch (e) {
      console.error(e);
      toast('Failed to load users from Firestore', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFbUsers();
  }, [firebaseEnabled]);

  const users = useMemo(() => {
    if (firebaseEnabled) {
      return fbUsers;
    }
    const stored = state.users || [];
    if (stored.length === 0 && currentUser) {
      return [{ id: currentUser.id || 'admin-1', username: currentUser.Username || currentUser.username || 'admin', role: 'admin', disabled: false }];
    }
    return stored;
  }, [firebaseEnabled, fbUsers, state.users, currentUser]);

  const filtered = useMemo(() =>
    users.filter(u => !search || u.username?.toLowerCase().includes(search.toLowerCase()))
  , [users, search]);

  const openModal = (u = null) => {
    setEditingUser(u);
    setForm(u ? {
      username: u.username,
      password: (u.password && u.password !== '••••••') ? u.password : '',
      role: u.role || 'user',
      disabled: !!u.disabled,
      categoryAccess: u.categoryAccess || { ...DEFAULT_CATEGORY_ACCESS },
      tabPermissions: u.tabPermissions || {},
      viewableUsers: u.viewableUsers || [],
      allowDataAccess: !!u.allowDataAccess
    } : { ...emptyForm, categoryAccess: { ...DEFAULT_CATEGORY_ACCESS }, tabPermissions: {} });
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.username.trim()) { toast('Username is required', 'error'); return; }
    if (firebaseEnabled && !form.username.includes('@')) {
      toast('Username must be a valid email for Firebase authentication', 'error');
      return;
    }

    if (!editingUser) {
      const existingUser = users.find(u => u.username?.toLowerCase() === form.username.trim().toLowerCase());
      if (existingUser) {
        if (!existingUser.disabled) {
          toast('A user with this email already exists in User Management.', 'error');
          return;
        }
        
        // If they exist but are disabled/deactivated, we will re-enable them and update their permissions
        if (firebaseEnabled) {
          setLoading(true);
          try {
            const { fbUpdateUserProfile } = await import('../services/firebaseAuth.js');
            const roleName = form.role === 'admin' ? 'Admin' : form.role === 'viewer' ? 'Viewer' : form.role === 'developer' ? 'Developer' : 'User';
            const res = await fbUpdateUserProfile(existingUser.id, {
              Username: form.username.trim(),
              Role: roleName,
              IsActive: true,
              categoryAccess: form.role === 'admin' ? { ...ADMIN_CATEGORY_ACCESS } : form.categoryAccess,
              tabPermissions: form.role === 'admin' ? {} : form.tabPermissions,
              viewableUsers: form.viewableUsers || [],
              allowDataAccess: form.role === 'developer' ? !!form.allowDataAccess : false
            });
            if (res.success) {
              toast('User re-activated and permissions updated');
              setIsModalOpen(false);
              loadFbUsers();
            } else {
              toast('Re-activation failed: ' + res.message, 'error');
            }
          } catch (err) {
            toast('Operation failed: ' + err.message, 'error');
          } finally {
            setLoading(false);
          }
        } else {
          const updated = users.map(u => u.id === existingUser.id
            ? { ...u, username: form.username.trim(), role: form.role, disabled: false,
                categoryAccess: form.role === 'admin' ? { ...ADMIN_CATEGORY_ACCESS } : form.categoryAccess,
                tabPermissions: form.role === 'admin' ? {} : form.tabPermissions,
                viewableUsers: form.viewableUsers || [],
                allowDataAccess: form.role === 'developer' ? !!form.allowDataAccess : false,
                ...(form.password.trim() ? { password: form.password.trim() } : {}) }
            : u
          );
          updateState({ users: updated });
          toast('User re-activated and permissions updated');
          setIsModalOpen(false);
        }
        return;
      }
    }

    if (!editingUser && !form.password.trim()) { toast('Password is required for new users', 'error'); return; }

    if (firebaseEnabled) {
      setLoading(true);
      try {
        const { fbRegisterUser, fbUpdateUserProfile } = await import('../services/firebaseAuth.js');
        const roleName = form.role === 'admin' ? 'Admin' : form.role === 'viewer' ? 'Viewer' : form.role === 'developer' ? 'Developer' : 'User';
        const profileData = {
          role: roleName,
          categoryAccess: form.role === 'admin' ? { ...ADMIN_CATEGORY_ACCESS } : form.categoryAccess,
          tabPermissions: form.role === 'admin' ? {} : form.tabPermissions,
          disabled: form.disabled
        };

        if (editingUser) {
          const newPass = form.password.trim();
          const currentPass = editingUser.password;
          if (newPass && newPass !== currentPass) {
            if (currentPass && currentPass !== '••••••') {
              const { fbAdminUpdateUserPassword } = await import('../services/firebaseAuth.js');
              const authRes = await fbAdminUpdateUserPassword(form.username.trim(), currentPass, newPass);
              if (!authRes.success) {
                toast('Failed to update Firebase Auth password: ' + authRes.message, 'error');
                setLoading(false);
                return;
              }
            } else {
              toast('Cannot update Firebase Auth password directly because their current password is not yet synced in Firestore. Please use "Send Password Reset Email" instead.', 'error');
              setLoading(false);
              return;
            }
          }

          const res = await fbUpdateUserProfile(editingUser.id, {
            Username: form.username.trim(),
            Role: roleName,
            IsActive: !form.disabled,
            categoryAccess: profileData.categoryAccess,
            tabPermissions: profileData.tabPermissions,
            viewableUsers: form.viewableUsers || [],
            allowDataAccess: form.role === 'developer' ? !!form.allowDataAccess : false,
            ...(newPass ? { Password: newPass } : {})
          });
          if (res.success) {
            toast('User updated');
            setIsModalOpen(false);
            loadFbUsers();
          } else {
            toast('Update failed: ' + res.message, 'error');
          }
        } else {
          const res = await fbRegisterUser(form.username.trim(), form.password.trim(), {
            role: roleName,
            categoryAccess: profileData.categoryAccess,
            tabPermissions: profileData.tabPermissions,
            viewableUsers: form.viewableUsers || [],
            allowDataAccess: form.role === 'developer' ? !!form.allowDataAccess : false
          });
          if (res.success) {
            toast('User created');
            setIsModalOpen(false);
            loadFbUsers();
          } else {
            if (res.message && (res.message.includes('already exists') || res.message.includes('already-in-use'))) {
              toast('Account already exists in Firebase Auth. Ask user to log in once to re-create their User Management profile.', 'error');
            } else {
              toast('Creation failed: ' + res.message, 'error');
            }
          }
        }
      } catch (err) {
        toast('Operation failed: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    } else {
      let updated;
      if (editingUser) {
        updated = users.map(u => u.id === editingUser.id
          ? { ...u, username: form.username.trim(), role: form.role, disabled: form.disabled,
              categoryAccess: form.role === 'admin' ? { ...ADMIN_CATEGORY_ACCESS } : form.categoryAccess,
              tabPermissions: form.role === 'admin' ? {} : form.tabPermissions,
              viewableUsers: form.viewableUsers || [],
              allowDataAccess: form.role === 'developer' ? !!form.allowDataAccess : false,
              ...(form.password.trim() ? { password: form.password.trim() } : {}) }
          : u
        );
        toast('User updated');
      } else {
        const newUser = {
          id: `user-${Date.now()}`, username: form.username.trim(), password: form.password.trim(),
          role: form.role, disabled: false,
          categoryAccess: form.role === 'admin' ? { ...ADMIN_CATEGORY_ACCESS } : form.categoryAccess,
          tabPermissions: form.tabPermissions || {},
          viewableUsers: form.viewableUsers || [],
          allowDataAccess: form.role === 'developer' ? !!form.allowDataAccess : false
        };
        updated = [...users, newUser];
        toast('User created');
      }
      updateState({ users: updated });
      setIsModalOpen(false);
    }
  };

  const handleDelete = async (id) => {
    const userToDel = users.find(u => u.id === id);
    if (currentUser && (currentUser.id === id || currentUser.username === userToDel?.username)) {
      toast('Cannot delete your own account', 'error'); return;
    }
    if (!window.confirm('Deactivate and remove all permissions for this user?')) return;

    // Build deactivated categories mapping (all permissions false)
    const deactivatedAccess = Object.keys(CATEGORIES).reduce((acc, catId) => {
      acc[catId] = { read: false, write: false };
      return acc;
    }, {});

    // Build deactivated tab permissions (all tabs false)
    const deactivatedTabs = ALL_TABS.reduce((acc, tab) => {
      acc[tab] = false;
      return acc;
    }, {});

    if (firebaseEnabled) {
      setLoading(true);
      try {
        const { fbUpdateUserProfile } = await import('../services/firebaseAuth.js');
        const res = await fbUpdateUserProfile(id, {
          IsActive: false,
          categoryAccess: deactivatedAccess,
          tabPermissions: deactivatedTabs
        });
        if (res.success) {
          toast('User deactivated and permissions removed');
          loadFbUsers();
        } else {
          toast('Failed to deactivate user', 'error');
        }
      } catch (err) {
        toast('Failed to deactivate user: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    } else {
      const updated = users.map(u => u.id === id
        ? { ...u, disabled: true, categoryAccess: deactivatedAccess, tabPermissions: deactivatedTabs }
        : u
      );
      updateState({ users: updated });
      toast('User deactivated and permissions removed');
    }
  };

  const handleToggleDisabled = async (id) => {
    if (currentUser && (currentUser.id === id)) { toast('Cannot disable your own account', 'error'); return; }

    if (firebaseEnabled) {
      setLoading(true);
      try {
        const { fbUpdateUserProfile } = await import('../services/firebaseAuth.js');
        const targetUser = users.find(u => u.id === id);
        const nextDisabledState = !targetUser.disabled;
        const res = await fbUpdateUserProfile(id, { IsActive: !nextDisabledState });
        if (res.success) {
          toast(nextDisabledState ? 'User disabled' : 'User enabled');
          loadFbUsers();
        } else {
          toast('Failed to toggle user status', 'error');
        }
      } catch (err) {
        toast('Failed to toggle status: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    } else {
      const updated = users.map(u => u.id === id ? { ...u, disabled: !u.disabled } : u);
      updateState({ users: updated });
      toast(updated.find(u => u.id === id)?.disabled ? 'User disabled' : 'User enabled');
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <TopBar title="User Management" onMenuClick={onMenuClick} />
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div className="max-w-md">
            <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
            <p className="text-slate-600">You must be an administrator to view this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="User Management" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-slate-500 text-sm">Manage access, roles, and credentials for all application users.</p>
          <div className="flex gap-2 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..."
              className="text-sm border rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <button onClick={() => openModal()} className="btn-primary px-4 py-2 rounded-xl shadow flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">User</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Password</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Role</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? filtered.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                        {(u.username || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{u.username}</p>
                        <p className="text-xs text-slate-400 font-mono">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-600">
                    {u.password || '••••••'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'developer' ? 'bg-indigo-100 text-indigo-700' :
                      u.role === 'viewer' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {u.role || 'user'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {u.disabled
                      ? <span className="flex items-center gap-1 text-red-600 text-xs font-bold"><XCircle className="w-4 h-4" /> Disabled</span>
                      : <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold"><CheckCircle className="w-4 h-4" /> Active</span>
                    }
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleToggleDisabled(u.id)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition ${u.disabled ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                      <button onClick={() => openModal(u)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(u.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{search ? 'No users match your search' : 'No users found'}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <UserCog className="w-5 h-5 text-emerald-600" />
                {editingUser ? 'Edit User' : 'Add User'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Username *</label>
                <input type="text" required value={form.username} onChange={e => setForm(p => ({...p, username: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder={firebaseEnabled ? "e.g. user@example.com" : "e.g. john.doe"} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{editingUser ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))}
                    required={!editingUser}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'} />
                  <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="user">User (Scientist)</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                  <option value="developer">Developer</option>
                </select>
              </div>
              {form.role === 'developer' && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <input type="checkbox" checked={form.allowDataAccess} onChange={e => setForm(p => ({...p, allowDataAccess: e.target.checked}))}
                      className="w-4 h-4 accent-indigo-600" />
                    <div>
                      <span className="text-xs font-bold text-indigo-700 block">Allow Data Access</span>
                      <span className="text-[10px] text-indigo-500 block">Developer can view and edit real trial data. Otherwise, they see empty sandboxed screens.</span>
                    </div>
                  </label>
                </div>
              )}
              {editingUser && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.disabled} onChange={e => setForm(p => ({...p, disabled: e.target.checked}))}
                    className="w-4 h-4 accent-red-500" />
                  <span className="text-sm text-slate-600">Disable this account</span>
                </label>
              )}

              {/* Category Access Control */}
              {form.role !== 'admin' && (
                <div className="border-t pt-3">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Category Access</label>
                  <div className="space-y-2">
                    {Object.values(CATEGORIES).map(cat => {
                      const Icon = ICON_MAP[cat.icon] || Leaf;
                      const access = form.categoryAccess?.[cat.id] || { read: false, write: false };
                      return (
                        <div key={cat.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: cat.color.hexLight }}>
                            <Icon className="w-3.5 h-3.5" style={{ color: cat.color.hex }} />
                          </div>
                          <span className="text-sm font-medium text-slate-700 flex-1">{cat.name}</span>
                          <label className="flex items-center gap-1 text-xs cursor-pointer">
                            <input type="checkbox" checked={access.read}
                              onChange={e => {
                                const newAccess = { ...form.categoryAccess, [cat.id]: { ...access, read: e.target.checked, write: e.target.checked ? access.write : false } };
                                setForm(p => ({ ...p, categoryAccess: newAccess }));
                              }}
                              className="w-3.5 h-3.5 accent-blue-500" />
                            <span className="text-slate-500">Read</span>
                          </label>
                          <label className="flex items-center gap-1 text-xs cursor-pointer">
                            <input type="checkbox" checked={access.write}
                              disabled={!access.read}
                              onChange={e => {
                                const newAccess = { ...form.categoryAccess, [cat.id]: { ...access, write: e.target.checked } };
                                setForm(p => ({ ...p, categoryAccess: newAccess }));
                              }}
                              className="w-3.5 h-3.5 accent-emerald-500" />
                            <span className="text-slate-500">Write</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Admin users automatically have full access to all categories.</p>
                </div>
              )}

              {/* Viewable Users (Cross-user sharing) */}
              {form.role !== 'admin' && (
                <div className="border-t pt-3">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Viewable Users (Shared Data Access)</label>
                  <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
                    {users.filter(u => u.id !== editingUser?.id && u.role !== 'admin' && u.role !== 'developer').map(other => (
                      <label key={other.id} className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-slate-100 rounded">
                        <input type="checkbox" checked={(form.viewableUsers || []).includes(other.id)}
                          onChange={e => {
                            const current = form.viewableUsers || [];
                            const updated = e.target.checked
                              ? [...current, other.id]
                              : current.filter(id => id !== other.id);
                            setForm(p => ({ ...p, viewableUsers: updated }));
                          }}
                          className="w-3.5 h-3.5 accent-blue-500" />
                        <span className="text-slate-700 truncate">{other.username} ({other.role})</span>
                      </label>
                    ))}
                    {users.filter(u => u.id !== editingUser?.id && u.role !== 'admin' && u.role !== 'developer').length === 0 && (
                      <span className="text-xs text-slate-400 block text-center py-2">No other scientists/viewers available to share data with.</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Select users whose trial data this user should be allowed to view (read-only).</p>
                </div>
              )}

              {/* Tab Permissions */}
              {form.role !== 'admin' && (
                <div className="border-t pt-3">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Tab Permissions (Enabled Tabs)</label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-100">
                    {ALL_TABS.map(tab => {
                      const isAllowed = form.tabPermissions?.[tab] !== false; // default to true
                      return (
                        <label key={tab} className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-slate-100 rounded">
                          <input type="checkbox" checked={isAllowed}
                            onChange={e => {
                              const newPerms = { ...form.tabPermissions, [tab]: e.target.checked };
                              setForm(p => ({ ...p, tabPermissions: newPerms }));
                            }}
                            className="w-3.5 h-3.5 accent-emerald-500" />
                          <span className="text-slate-700 truncate">{tab}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {form.role === 'admin' && (
                <p className="text-xs text-indigo-500 bg-indigo-50 px-3 py-2 rounded-lg font-medium">
                  ⚡ Admin users have full read/write access to all categories and tabs.
                </p>
              )}

              {form.role === 'developer' && (
                <p className="text-xs text-indigo-500 bg-indigo-50 px-3 py-2 rounded-lg font-medium">
                  ⚡ Developers have full access to all features but see no data by default. Enable "Allow Data Access" to let them view/edit real data.
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                <button type="submit" disabled={loading} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                  {loading ? 'Processing...' : (editingUser ? 'Update' : 'Create User')}
                </button>
              </div>
            </form>
            {editingUser && firebaseEnabled && (
                <div className="mt-4 pt-3 border-t">
                    <button type="button" onClick={async () => {
                        const email = prompt("Enter the user's email to send a password reset link:");
                        if (email) {
                            try {
                                const { fbResetPassword } = await import('../services/firebaseAuth.js');
                                const res = await fbResetPassword(email);
                                if (res.success) toast('Password reset email sent!', 'success');
                                else toast(res.message, 'error');
                            } catch (e) { toast('Error sending reset email', 'error'); }
                        }
                    }} className="w-full px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition">Send Password Reset Email (Firebase)</button>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
