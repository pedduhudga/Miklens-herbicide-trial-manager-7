import React, { useState, useEffect } from 'react';
import { getUsers } from '../services/dataLayer.js';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import Modal from './Modal.jsx';
import { Share2, Shield, Eye, Edit3, Loader } from 'lucide-react';

export default function AppSharingModal({ isOpen, onClose, initialSharedWith = [], initialSharedWithEdit = [], onSave }) {
  const { getAppState } = useAppState();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharedWith, setSharedWith] = useState(initialSharedWith || []);
  const [sharedWithEdit, setSharedWithEdit] = useState(initialSharedWithEdit || []);

  const ownUid = user?.uid || user?.ID || user?.id;

  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      setLoading(true);
      try {
        const list = await getUsers({}, getAppState);
        // Exclude admins and the sharing user
        const filtered = (list || []).filter(u => {
          const role = String(u.role || u.Role || '').toLowerCase();
          const uid = u.id || u.ID || u.uid;
          return role !== 'admin' && uid !== ownUid;
        });
        setUsers(filtered);
      } catch (e) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to load users for sharing', type: 'error' } }));
      } finally {
        setLoading(false);
      }
    }
    load();
    setSharedWith(initialSharedWith || []);
    setSharedWithEdit(initialSharedWithEdit || []);
  }, [isOpen, initialSharedWith, initialSharedWithEdit, ownUid, getAppState]);

  const handleToggleView = (uid) => {
    if (sharedWith.includes(uid)) {
      setSharedWith(prev => prev.filter(id => id !== uid));
      // Unchecking view automatically revokes edit access
      setSharedWithEdit(prev => prev.filter(id => id !== uid));
    } else {
      setSharedWith(prev => [...prev, uid]);
    }
  };

  const handleToggleEdit = (uid) => {
    if (sharedWithEdit.includes(uid)) {
      setSharedWithEdit(prev => prev.filter(id => id !== uid));
    } else {
      setSharedWithEdit(prev => [...prev, uid]);
      // Checking edit automatically grants view access
      if (!sharedWith.includes(uid)) {
        setSharedWith(prev => [...prev, uid]);
      }
    }
  };

  const handleSaveClick = () => {
    onSave(sharedWith, sharedWithEdit);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="App Access Sharing" maxWidth="max-w-md">
      <div className="space-y-4 py-2">
        <p className="text-xs text-slate-500">
          Share this item with other scientists and developers. Grant edit privileges if they should be allowed to modify it.
        </p>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader className="w-8 h-8 text-indigo-600 animate-spin" />
            <span className="text-xs font-semibold text-slate-500">Loading users...</span>
          </div>
        ) : users.length > 0 ? (
          <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {users.map(u => {
              const uid = u.id || u.ID || u.uid;
              const hasView = sharedWith.includes(uid);
              const hasEdit = sharedWithEdit.includes(uid);
              return (
                <div key={uid} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{u.username || u.Username}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-wider">{u.role || u.Role || 'Scientist'}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {/* View Checkbox */}
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={hasView} 
                        onChange={() => handleToggleView(uid)} 
                        className="w-4 h-4 accent-blue-600 rounded border-slate-300"
                      />
                      <span className="text-xs font-semibold text-slate-600 flex items-center gap-0.5" title="View Access">
                        <Eye className="w-3.5 h-3.5" /> View
                      </span>
                    </label>

                    {/* Edit Checkbox */}
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={hasEdit} 
                        onChange={() => handleToggleEdit(uid)} 
                        className="w-4 h-4 accent-emerald-600 rounded border-slate-300"
                      />
                      <span className="text-xs font-semibold text-slate-600 flex items-center gap-0.5" title="Edit Access">
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400 text-xs">
            No other scientists or developers are available to share with.
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
          >
            Cancel
          </button>
          <button 
            type="button" 
            onClick={handleSaveClick}
            disabled={loading}
            className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold shadow-md"
          >
            Save Sharing Settings
          </button>
        </div>
      </div>
    </Modal>
  );
}
