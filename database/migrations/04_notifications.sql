-- Notification log (for debugging/audit)
CREATE TABLE IF NOT EXISTS public.notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  channel TEXT CHECK (channel IN ('sms','email')),
  type TEXT,                      -- 'booking_confirmed','reminder','cancelled', etc.
  payload JSONB,
  sent_at TIMESTAMPTZ DEFAULT now()
);
