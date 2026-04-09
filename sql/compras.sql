-- ============================================================
--  KIUBII — Módulo de Compras
--  Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Tabla de compras (cabecera)
CREATE TABLE IF NOT EXISTS public.purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier        TEXT NOT NULL DEFAULT '',
  date            DATE NOT NULL,
  payment_method  TEXT NOT NULL DEFAULT 'efectivo',
  invoice_number  TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  user_id         UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de líneas de compra
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES public.products(id),
  product_name    TEXT NOT NULL DEFAULT '',
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_purchases_date       ON public.purchases(date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purch ON public.purchase_items(purchase_id);

-- 4. RLS
ALTER TABLE public.purchases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchases_select" ON public.purchases
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "purchases_insert" ON public.purchases
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "purchases_delete" ON public.purchases
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "purchase_items_select" ON public.purchase_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id));

CREATE POLICY "purchase_items_insert" ON public.purchase_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id));

CREATE POLICY "purchase_items_delete" ON public.purchase_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id));

-- 5. RPC: register_purchase — atómico
--    • Inserta cabecera + líneas
--    • Incrementa stock en products
--    • Actualiza buy_price si cambió
--    • Crea gasto automático en expenses
CREATE OR REPLACE FUNCTION public.register_purchase(
  p_supplier        TEXT,
  p_date            DATE,
  p_payment_method  TEXT,
  p_invoice_number  TEXT,
  p_notes           TEXT,
  p_total           NUMERIC,
  p_user_id         UUID,
  p_items           JSONB  -- [{product_id, product_name, quantity, unit_price, subtotal}]
)
RETURNS UUID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_purchase_id UUID;
  v_item        JSONB;
  v_prod_id     UUID;
  v_qty         INTEGER;
  v_price       NUMERIC;
  v_sub         NUMERIC;
BEGIN
  -- 1. Insertar cabecera de compra
  INSERT INTO public.purchases
    (supplier, date, payment_method, invoice_number, notes, total, user_id)
  VALUES
    (p_supplier, p_date, p_payment_method,
     COALESCE(p_invoice_number, ''), COALESCE(p_notes, ''),
     p_total, p_user_id)
  RETURNING id INTO v_purchase_id;

  -- 2. Procesar cada línea
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty     := COALESCE((v_item->>'quantity')::INTEGER, 1);
    v_price   := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_sub     := COALESCE((v_item->>'subtotal')::NUMERIC, v_qty * v_price);

    -- Insertar línea de compra
    INSERT INTO public.purchase_items
      (purchase_id, product_id, product_name, quantity, unit_price, subtotal)
    VALUES
      (v_purchase_id, v_prod_id,
       COALESCE(v_item->>'product_name', ''),
       v_qty, v_price, v_sub);

    -- Actualizar stock e buy_price del producto
    UPDATE public.products
    SET
      stock      = stock + v_qty,
      buy_price  = v_price,
      updated_at = NOW()
    WHERE id = v_prod_id;
  END LOOP;

  -- 3. Registrar como gasto automático
  INSERT INTO public.expenses
    (date, category, description, supplier, amount, payment_method, user_id)
  VALUES (
    p_date,
    'Compra de mercancía',
    'Compra: ' || CASE
      WHEN COALESCE(p_invoice_number, '') <> '' THEN p_invoice_number
      ELSE p_supplier
    END,
    p_supplier,
    p_total,
    p_payment_method,
    p_user_id
  );

  RETURN v_purchase_id;
END;
$$;
