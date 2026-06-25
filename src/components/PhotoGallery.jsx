// src/components/PhotoGallery.jsx
import React, { useRef } from 'react';
import CameraCapture from './CameraCapture.jsx';
import { X, Image as ImageIcon, RefreshCw, Tag } from 'lucide-react';

const DIRECTION_OPTIONS = ['Nadir', 'Oblique', 'Close-Up', 'Panoramic'];

/**
 * PhotoGallery – a reusable component that lets the user capture multiple photos
 * via the device camera or upload from the file system, preview them as a grid,
 * and optionally trigger AI analysis for each image.
 *
 * Props:
 *   photos: Array of photo objects { id, base64, direction, treatment, daa, plotNumber, aiResult? }
 *   setPhotos: setter function to update the photos array
 *   onCapture: function(base64) called when a new photo is captured (optional)
 *   onUpdateTags: optional function(photoId, tags) called when tags are saved — parent
 *                 can wire this to updateTrial() to persist. If absent, local state only.
 *   maxPhotos: optional limit (default 10)
 *   enableAI: boolean – show a button to run AI on a photo
 */
export default function PhotoGallery({
  photos = [],
  setPhotos,
  onCapture,
  onUpdateTags,
  maxPhotos = 10,
  enableAI = true,
}) {
  const fileInputRef = useRef(null);

  // Track which photo has its tag-edit form open
  const [editingId, setEditingId] = React.useState(null);
  // Per-photo form draft state (keyed by photo id)
  const [editDraft, setEditDraft] = React.useState({});

  const openEditForm = (photo) => {
    setEditDraft(prev => ({
      ...prev,
      [photo.id]: {
        direction: photo.direction || 'Nadir',
        treatment: photo.treatment || '',
        daa: photo.daa != null ? String(photo.daa) : '',
        plotNumber: photo.plotNumber || '',
      },
    }));
    setEditingId(photo.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveTags = (photoId) => {
    const draft = editDraft[photoId] || {};
    const tags = {
      direction: draft.direction || null,
      treatment: draft.treatment || null,
      daa: draft.daa ? parseInt(draft.daa, 10) : null,
      plotNumber: draft.plotNumber || null,
    };

    // Always update local state
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, ...tags } : p));

    // Call parent callback if provided (e.g. to persist via updateTrial)
    if (onUpdateTags) {
      onUpdateTags(photoId, tags);
    }

    setEditingId(null);
  };

  const addPhoto = (base64, direction = 'Nadir') => {
    const newPhoto = {
      id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      base64,
      direction,
    };
    setPhotos(prev => [...prev, newPhoto]);
    if (onCapture) onCapture(base64);
  };

  const handleFileSelect = e => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        addPhoto(ev.target.result, 'Nadir');
      };
      reader.readAsDataURL(file);
    });
    e.target.value = null;
  };

  const removePhoto = id => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const triggerCamera = () => {
    setShowCamera(true);
  };

  const [showCamera, setShowCamera] = React.useState(false);

  const handleCapture = base64 => {
    addPhoto(base64);
    setShowCamera(false);
  };

  const runAI = async (photo) => {
    if (photo.aiResult) return;
    setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, loading: true } : p));
    try {
      const { identifyWeedFromPhoto } = await import('../services/multiProviderAI.js');
      const result = await identifyWeedFromPhoto(photo.base64);
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, aiResult: result, loading: false } : p));
    } catch (err) {
      console.warn('AI analysis failed', err);
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, loading: false } : p));
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-emerald-700">Field Photos</h3>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-full bg-emerald-100 hover:bg-emerald-200 transition focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
            title="Upload from Gallery"
            aria-label="Upload photo from gallery"
          >
            <ImageIcon className="w-5 h-5 text-emerald-600" />
          </button>
          <button
            onClick={triggerCamera}
            className="p-2 rounded-full bg-emerald-100 hover:bg-emerald-200 transition focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
            title="Capture with Camera"
            aria-label="Capture photo with camera"
          >
            <RefreshCw className="w-5 h-5 text-emerald-600" />
          </button>
        </div>
        <input
          type="file"
          multiple
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map(photo => (
          <div key={photo.id} className="relative group flex flex-col">
            <div className="relative">
              <img
                src={photo.base64}
                alt="capture"
                className="w-full h-32 object-cover rounded-lg border border-emerald-200"
              />
              <button
                onClick={() => removePhoto(photo.id)}
                className="absolute top-1 right-1 p-1 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none focus-visible:opacity-100"
                title="Remove"
                aria-label="Remove photo"
              >
                <X className="w-4 h-4 text-emerald-600" />
              </button>
              {enableAI && (
                <div className="absolute inset-0 flex items-end justify-center p-2">
                  {photo.loading ? (
                    <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">Analyzing…</span>
                  ) : photo.aiResult ? (
                    <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">{photo.aiResult.length} weeds detected</span>
                  ) : (
                    <button
                      onClick={() => runAI(photo)}
                      className="bg-emerald-600 text-white text-xs px-2 py-1 rounded opacity-80 hover:opacity-100 transition"
                    >
                      Run AI
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Task 19.4 — direction sub-label below thumbnail */}
            {photo.direction && (
              <p className="text-center text-[10px] text-emerald-600 font-medium mt-0.5">
                {photo.direction}
              </p>
            )}

            {/* Edit Tags button */}
            {editingId !== photo.id && (
              <button
                onClick={() => openEditForm(photo)}
                className="mt-1 flex items-center justify-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded px-1 py-0.5 transition focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                aria-label="Edit photo tags"
              >
                <Tag className="w-3 h-3" />
                Edit Tags
              </button>
            )}

            {/* Task 19.3 — inline tag-edit form */}
            {editingId === photo.id && editDraft[photo.id] && (
              <div className="mt-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex flex-col gap-1.5 text-xs">
                {/* Direction dropdown */}
                <label className="flex flex-col gap-0.5">
                  <span className="text-emerald-700 font-medium">Direction</span>
                  <select
                    value={editDraft[photo.id].direction}
                    onChange={e =>
                      setEditDraft(prev => ({
                        ...prev,
                        [photo.id]: { ...prev[photo.id], direction: e.target.value },
                      }))
                    }
                    className="rounded border border-emerald-300 bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    {DIRECTION_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>

                {/* Treatment text input */}
                <label className="flex flex-col gap-0.5">
                  <span className="text-emerald-700 font-medium">Treatment</span>
                  <input
                    type="text"
                    value={editDraft[photo.id].treatment}
                    onChange={e =>
                      setEditDraft(prev => ({
                        ...prev,
                        [photo.id]: { ...prev[photo.id], treatment: e.target.value },
                      }))
                    }
                    placeholder="e.g. Roundup 5L/ha"
                    className="rounded border border-emerald-300 bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </label>

                {/* DAA number input */}
                <label className="flex flex-col gap-0.5">
                  <span className="text-emerald-700 font-medium">DAA</span>
                  <input
                    type="number"
                    value={editDraft[photo.id].daa}
                    onChange={e =>
                      setEditDraft(prev => ({
                        ...prev,
                        [photo.id]: { ...prev[photo.id], daa: e.target.value },
                      }))
                    }
                    placeholder="Days after application"
                    min="0"
                    className="rounded border border-emerald-300 bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </label>

                {/* Plot Number text input */}
                <label className="flex flex-col gap-0.5">
                  <span className="text-emerald-700 font-medium">Plot No.</span>
                  <input
                    type="text"
                    value={editDraft[photo.id].plotNumber}
                    onChange={e =>
                      setEditDraft(prev => ({
                        ...prev,
                        [photo.id]: { ...prev[photo.id], plotNumber: e.target.value },
                      }))
                    }
                    placeholder="e.g. P1"
                    className="rounded border border-emerald-300 bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </label>

                {/* Save / Cancel */}
                <div className="flex gap-1 mt-0.5">
                  <button
                    onClick={() => saveTags(photo.id)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded px-2 py-1 transition focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex-1 bg-white hover:bg-gray-100 text-gray-600 text-xs font-medium rounded border border-gray-300 px-2 py-1 transition focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {photos.length < maxPhotos && (
          <div onClick={triggerCamera} className="flex items-center justify-center border-2 border-dashed border-emerald-300 rounded-lg cursor-pointer hover:bg-emerald-50 transition">
            <span className="text-emerald-600 font-medium">Add Photo</span>
          </div>
        )}
      </div>
      {showCamera && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <CameraCapture isOpen={true} onClose={() => setShowCamera(false)} onCapture={handleCapture} initialAspectRatio="3:4" onAspectChange={() => {}} />
        </div>
      )}
    </div>
  );
}
