-- ============================================================
--  KIUBII — Supabase Schema
--  Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
--  TRIGGER: updated_at automático
--  (debe ir ANTES que cualquier tabla)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
--  TABLA: profiles
--  Extiende auth.users con nombre y rol
--  (debe ir ANTES de is_admin(), que la referencia)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'vendedor'
                CHECK (role IN ('admin', 'vendedor')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
--  FUNCIÓN AUXILIAR: is_admin()
--  Ahora puede referenciar public.profiles sin error
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- Políticas de profiles (van después de is_admin() para poder usarla)
-- Todos los autenticados pueden ver perfiles (necesario para dropdowns de admin)
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (TRUE);

-- Cada usuario puede actualizar su propio perfil; admin puede actualizar cualquiera
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());

-- Solo admin puede insertar perfiles manualmente (el trigger crea el resto)
CREATE POLICY "profiles_insert_admin" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: al crear un auth.user, auto-crear su perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
--  TABLA: products
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                   TEXT NOT NULL,
  name                  TEXT NOT NULL,
  category              TEXT,
  brand                 TEXT,
  unit                  TEXT DEFAULT 'pieza',
  buy_price             NUMERIC(10,2) NOT NULL DEFAULT 0,  -- SENSIBLE: solo admin
  sell_price            NUMERIC(10,2) NOT NULL DEFAULT 0,
  sell_price_wholesale  NUMERIC(10,2),
  stock                 INTEGER NOT NULL DEFAULT 0,
  min_stock             INTEGER NOT NULL DEFAULT 5,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_sku_unique UNIQUE (sku)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total
CREATE POLICY "products_admin_all" ON public.products
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Vendedor: solo lectura (buy_price oculto en la app; para máxima seguridad ver view abajo)
CREATE POLICY "products_vendedor_select" ON public.products
  FOR SELECT TO authenticated
  USING (TRUE); -- Todos ven el row; buy_price se filtra en la app

-- NOTA DE SEGURIDAD: Para ocultar buy_price completamente a nivel DB,
-- crea esta view y úsala desde el cliente para vendedores:
--
--   CREATE OR REPLACE VIEW public.products_public AS
--   SELECT id, sku, name, category, brand, unit,
--          sell_price, sell_price_wholesale, stock, min_stock,
--          created_at, updated_at
--   FROM public.products;
--
-- Luego apunta el fetch de vendedores a 'products_public' en lugar de 'products'.

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
--  TABLA: customers
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID REFERENCES public.profiles(id),
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  address          TEXT,
  type             TEXT DEFAULT 'menudeo'
                     CHECK (type IN ('menudeo', 'mayoreo', 'distribuidor')),
  notes            TEXT,
  total_purchases  NUMERIC(10,2) DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_admin_all" ON public.customers
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "customers_vendedor_select_own" ON public.customers
  FOR SELECT TO authenticated
  USING (NOT is_admin() AND owner_id = auth.uid());

CREATE POLICY "customers_vendedor_insert" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_admin() AND owner_id = auth.uid());

CREATE POLICY "customers_vendedor_update_own" ON public.customers
  FOR UPDATE TO authenticated
  USING (NOT is_admin() AND owner_id = auth.uid())
  WITH CHECK (NOT is_admin() AND owner_id = auth.uid());

CREATE POLICY "customers_vendedor_delete_own" ON public.customers
  FOR DELETE TO authenticated
  USING (NOT is_admin() AND owner_id = auth.uid());

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
--  TABLA: sales
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id),
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name   TEXT NOT NULL,
  date            DATE NOT NULL,
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method  TEXT DEFAULT 'efectivo',
  status          TEXT DEFAULT 'pagado'
                    CHECK (status IN ('pagado', 'credito', 'cancelado')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_admin_all" ON public.sales
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "sales_vendedor_own" ON public.sales
  FOR ALL TO authenticated
  USING (NOT is_admin() AND user_id = auth.uid())
  WITH CHECK (NOT is_admin() AND user_id = auth.uid());

CREATE TRIGGER sales_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
--  TABLA: sale_items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sale_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id       UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  qty           NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal      NUMERIC(10,2) NOT NULL DEFAULT 0
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_items_admin" ON public.sale_items
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "sale_items_vendedor" ON public.sale_items
  FOR ALL TO authenticated
  USING (
    NOT is_admin() AND
    EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.user_id = auth.uid())
  )
  WITH CHECK (
    NOT is_admin() AND
    EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.user_id = auth.uid())
  );

-- ============================================================
--  TABLA: expenses  (solo admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id),
  date            DATE NOT NULL,
  category        TEXT,
  description     TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  supplier        TEXT,
  payment_method  TEXT DEFAULT 'efectivo',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Solo admin puede ver y gestionar gastos
CREATE POLICY "expenses_admin_all" ON public.expenses
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
--  TABLA: receivables  (cuentas por cobrar)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.receivables (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID REFERENCES public.profiles(id),
  customer_id      UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name    TEXT NOT NULL,
  sale_id          UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  original_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance          NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date         DATE,
  status           TEXT DEFAULT 'pendiente'
                     CHECK (status IN ('pendiente', 'parcial', 'vencido', 'pagado')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receivables_admin_all" ON public.receivables
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "receivables_vendedor_own" ON public.receivables
  FOR ALL TO authenticated
  USING (NOT is_admin() AND owner_id = auth.uid())
  WITH CHECK (NOT is_admin() AND owner_id = auth.uid());

CREATE TRIGGER receivables_updated_at
  BEFORE UPDATE ON public.receivables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
--  TABLA: receivable_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.receivable_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id  UUID NOT NULL REFERENCES public.receivables(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  method         TEXT DEFAULT 'efectivo',
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_payments_admin" ON public.receivable_payments
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "rec_payments_vendedor" ON public.receivable_payments
  FOR ALL TO authenticated
  USING (
    NOT is_admin() AND
    EXISTS (SELECT 1 FROM public.receivables r WHERE r.id = receivable_id AND r.owner_id = auth.uid())
  )
  WITH CHECK (
    NOT is_admin() AND
    EXISTS (SELECT 1 FROM public.receivables r WHERE r.id = receivable_id AND r.owner_id = auth.uid())
  );

-- ============================================================
--  TABLA: quotes  (cotizaciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id),
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name   TEXT NOT NULL,
  date            DATE NOT NULL,
  valid_until     DATE,
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_discount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          TEXT DEFAULT 'borrador'
                    CHECK (status IN ('borrador', 'enviada', 'aceptada', 'rechazada')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_admin_all" ON public.quotes
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "quotes_vendedor_own" ON public.quotes
  FOR ALL TO authenticated
  USING (NOT is_admin() AND user_id = auth.uid())
  WITH CHECK (NOT is_admin() AND user_id = auth.uid());

CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
--  TABLA: quote_items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quote_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id      UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  qty           NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount      NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal      NUMERIC(10,2) NOT NULL DEFAULT 0
);

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_items_admin" ON public.quote_items
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "quote_items_vendedor" ON public.quote_items
  FOR ALL TO authenticated
  USING (
    NOT is_admin() AND
    EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.user_id = auth.uid())
  )
  WITH CHECK (
    NOT is_admin() AND
    EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.user_id = auth.uid())
  );

-- ============================================================
--  RPC: apply_payment  (aplica abono de forma atómica)
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_payment(
  p_receivable_id  UUID,
  p_amount         NUMERIC,
  p_date           DATE,
  p_method         TEXT,
  p_notes          TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec         receivables%ROWTYPE;
  v_new_paid    NUMERIC;
  v_new_balance NUMERIC;
  v_new_status  TEXT;
BEGIN
  SELECT * INTO v_rec FROM receivables WHERE id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por cobrar no encontrada: %', p_receivable_id;
  END IF;

  v_new_paid    := v_rec.paid_amount + p_amount;
  v_new_balance := GREATEST(0, v_rec.original_amount - v_new_paid);
  v_new_status  := CASE
    WHEN v_new_balance = 0  THEN 'pagado'
    WHEN v_new_paid > 0     THEN 'parcial'
    ELSE 'pendiente'
  END;

  INSERT INTO receivable_payments (receivable_id, date, amount, method, notes)
  VALUES (p_receivable_id, p_date, p_amount, p_method, COALESCE(p_notes, ''));

  UPDATE receivables
  SET paid_amount = v_new_paid,
      balance     = v_new_balance,
      status      = v_new_status,
      updated_at  = NOW()
  WHERE id = p_receivable_id;
END;
$$;

-- ============================================================
--  RPC: convert_quote_to_sale  (conversión atómica)
-- ============================================================
CREATE OR REPLACE FUNCTION public.convert_quote_to_sale(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quote    quotes%ROWTYPE;
  v_sale_id  UUID;
  v_item     quote_items%ROWTYPE;
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada: %', p_quote_id; END IF;

  INSERT INTO sales (user_id, customer_id, customer_name, date,
                     subtotal, discount, total, payment_method, status, notes)
  VALUES (auth.uid(), v_quote.customer_id, v_quote.customer_name, CURRENT_DATE,
          v_quote.total, 0, v_quote.total,
          'transferencia', 'pagado',
          COALESCE('Convertido de cotización. ' || v_quote.notes, 'Convertido de cotización.'))
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM quote_items WHERE quote_id = p_quote_id LOOP
    INSERT INTO sale_items (sale_id, product_id, product_name, qty, unit_price, subtotal)
    VALUES (v_sale_id, v_item.product_id, v_item.product_name, v_item.qty,
            ROUND(v_item.unit_price * (1 - v_item.discount / 100.0), 2),
            v_item.subtotal);
  END LOOP;

  UPDATE quotes SET status = 'aceptada', updated_at = NOW() WHERE id = p_quote_id;

  RETURN v_sale_id;
END;
$$;

-- ============================================================
--  FUNCIÓN: seed_sample_data()
--  Ejecutar UNA VEZ como admin después del primer login
--  Ejemplo: SELECT seed_sample_data();
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_sample_data()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo un admin puede ejecutar el seed';
  END IF;

  IF (SELECT COUNT(*) FROM products) > 0 THEN
    RETURN 'Ya existen datos. Seed omitido.';
  END IF;

  -- Productos
  INSERT INTO products (sku, name, category, brand, unit, buy_price, sell_price, sell_price_wholesale, stock, min_stock) VALUES
    ('WP-CHOC-1K',    'Whey Protein Chocolate 1kg',           'Proteínas',   'Optimum Nutrition', 'bolsa',   580, 950,  820,  42, 10),
    ('WP-VAIN-2K',    'Whey Protein Vainilla 2kg',             'Proteínas',   'MuscleTech',        'bolsa',   980, 1650, 1420, 18,  8),
    ('CREAT-500G',    'Creatina Monohidrato 500g',              'Creatina',    'Dymatize',          'bote',    240, 420,  360,  55, 15),
    ('PRE-FURY-30',   'Pre-Entreno Fury 30 servicios',          'Pre-Entreno', 'BSN',               'bote',    420, 699,  580,   8, 10),
    ('PRE-N2X-60',    'Pre-Entreno N.O. Xplode 60 serv',       'Pre-Entreno', 'BSN',               'bote',    680, 1100, 940,  12,  8),
    ('VIT-C-60',      'Vitamina C 1000mg 60 cáps',              'Vitaminas',   'Now Foods',         'frasco',   85, 150,  120,  80, 20),
    ('OMEG-120',      'Omega 3 Fish Oil 120 cáps',              'Vitaminas',   'Carlson',           'frasco',  180, 320,  270,  45, 15),
    ('BCAA-TROP-400', 'BCAA Tropical 400g',                    'Aminoácidos', 'Scivation',         'bolsa',   360, 599,  499,   6, 10),
    ('QUEM-LIPO6-60', 'Quemador Lipo-6 Black 60 cáps',         'Quemadores',  'Nutrex',            'frasco',  480, 799,  670,  22,  8),
    ('QUEM-HYDRA-120','Quemador Hydroxycut 120 cáps',           'Quemadores',  'MuscleTech',        'frasco',  520, 869,  730,  15,  8),
    ('GLUTAM-300G',   'Glutamina 300g',                        'Aminoácidos', 'Optimum Nutrition', 'bote',    210, 380,  310,   3, 10),
    ('MULTI-ANIMAL-44','Multivitamínico Animal Pak 44 paks',   'Vitaminas',   'Universal',         'caja',    640, 1050, 890,  20,  5);

  -- Clientes (asignados al admin)
  INSERT INTO customers (owner_id, name, email, phone, type, address, notes) VALUES
    (v_admin_id, 'Carlos Mendoza',          'carlos.mendoza@gmail.com', '5551234567', 'menudeo',     'Av. Insurgentes 420, CDMX',        'Cliente frecuente, prefiere whey chocolate'),
    (v_admin_id, 'GymZone Tepito',           'ventas@gymzone.mx',        '5589763421', 'mayoreo',     'Calle Toltecas 88, Tepito, CDMX',  'Pago a 15 días'),
    (v_admin_id, 'Suplementos del Norte SA', 'compras@supnorte.mx',      '8121234567', 'distribuidor','Av. Revolución 1200, Monterrey',   'Distribuidor zona norte'),
    (v_admin_id, 'Ana Gómez',                'ana.gomez@outlook.com',    '5598761234', 'menudeo',     'Col. Narvarte, CDMX',              ''),
    (v_admin_id, 'FitLife Gym',              'info@fitlifegym.mx',       '5523456789', 'mayoreo',     'Av. Universidad 1800, CDMX',       'Compra mensual fija'),
    (v_admin_id, 'Distribuidora ProFit',     'pedidos@profitmx.com',     '3311234567', 'distribuidor','López Cotilla 900, Guadalajara',   '20% descuento por volumen');

  RETURN 'Datos de ejemplo creados correctamente ✓';
END;
$$;

-- ============================================================
--  INSTRUCCIONES PARA CREAR USUARIOS
--
--  OPCIÓN A — Desde Dashboard (recomendado)
--  1. Authentication → Users → "Add user" → "Create new user"
--  2. Activa "Auto Confirm User" en ese formulario (¡importante!)
--  3. En "User metadata" agrega:
--       { "name": "Laura Admin", "role": "admin" }
--
--  OPCIÓN B — Deshabilitar confirmación de email globalmente
--  Authentication → Providers → Email → desactiva "Confirm email"
--  Esto permite login inmediato sin confirmación para todos los usuarios.
--
--  OPCIÓN C — Confirmar usuario existente manualmente via SQL
--  Si ya creaste el usuario sin confirmar, ejecuta esto en SQL Editor:
--
--    UPDATE auth.users
--    SET email_confirmed_at = NOW(),
--        confirmation_token = '',
--        confirmation_sent_at = NULL
--    WHERE email = 'tu@email.com';
--
--  OPCIÓN D — Crear perfil manualmente si el trigger no lo creó
--  (para usuarios creados antes de ejecutar este schema)
--
--    INSERT INTO public.profiles (id, name, role)
--    SELECT id, email, 'admin'
--    FROM auth.users
--    WHERE email = 'tu@email.com'
--    ON CONFLICT (id) DO UPDATE SET role = 'admin';
--
--  Para cambiar rol de un usuario existente:
--    UPDATE public.profiles SET role = 'admin' WHERE id = '[UUID]';
--
--  Para ejecutar el seed de datos de ejemplo (solo una vez, como admin):
--    SELECT public.seed_sample_data();
-- ============================================================
