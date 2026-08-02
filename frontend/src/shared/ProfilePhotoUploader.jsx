import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import Avatar from './ui/Avatar';

export default function ProfilePhotoUploader({ user, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await onUpload(file);
      setSuccess('Profile photo updated.');
    } catch (uploadError) {
      setError(uploadError.message || 'Could not upload profile photo.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await onRemove();
      setSuccess('Profile photo removed. Initials will be shown instead.');
    } catch (removeError) {
      setError(removeError.message || 'Could not remove profile photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-care-border bg-care-neutral p-4" aria-label="Profile photo">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="relative w-fit shrink-0">
          <Avatar
            name={user?.full_name || 'Account'}
            id={user?.id}
            src={user?.avatar_url}
            size="lg"
            variant="brand"
          />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-care-surface bg-care-primary text-care-surface" aria-hidden="true">
            <Camera className="h-3.5 w-3.5" />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-care-heading">Profile picture</h3>
          <p className="mt-1 text-xs leading-5 text-care-muted">JPEG, PNG, or WebP. Maximum file size 2 MB.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} className="sr-only" aria-label="Choose profile photo" />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-care-primary px-3 text-xs font-semibold text-care-surface transition-colors hover:bg-care-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {user?.avatar_url ? 'Replace photo' : 'Add photo'}
            </button>
            {user?.avatar_url && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-care-danger/30 bg-care-surface px-3 text-xs font-semibold text-care-danger transition-colors hover:bg-care-danger/10 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-danger"
              >
                <Trash2 className="h-4 w-4" /> Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg border border-care-danger/25 bg-care-danger/10 px-3 py-2 text-xs font-medium text-care-danger">{error}</p>}
      {success && <p className="mt-3 rounded-lg border border-care-success/25 bg-care-primary-subtle px-3 py-2 text-xs font-medium text-care-success">{success}</p>}
    </section>
  );
}
