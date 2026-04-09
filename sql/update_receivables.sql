-- ============================================================
--  KIUBII — Migración: Módulo CxC mejorado
--  Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- Agregar columnas para guardar info del vendedor y fecha de la venta
ALTER TABLE public.receivables
  ADD COLUMN IF NOT EXISTS seller_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS sale_date   DATE;

-- Poblar sale_date en registros existentes desde la venta ligada
UPDATE public.receivables r
SET sale_date = s.date
FROM public.sales s
WHERE r.sale_id = s.id
  AND r.sale_date IS NULL;
