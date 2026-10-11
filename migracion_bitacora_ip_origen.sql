-- CU06: registro de la dirección IP de origen en la bitácora.
-- Es opcional (admite NULL), por lo que no rompe el código ni los
-- triggers existentes. Es seguro ejecutarla más de una vez.

ALTER TABLE public.bitacora
  ADD COLUMN IF NOT EXISTS ip_origen VARCHAR(45);

CREATE INDEX IF NOT EXISTS idx_bitacora_ip_origen
  ON public.bitacora (ip_origen);
  