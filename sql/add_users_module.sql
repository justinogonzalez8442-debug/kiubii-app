-- ============================================================
--  KIUBII — Migración: Módulo de Usuarios
--  Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Agregar columnas a profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email    TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Actualizar el trigger para guardar también el email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, disabled)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor'),
    FALSE
  )
  ON CONFLICT (id) DO UPDATE
    SET name  = COALESCE(EXCLUDED.name, public.profiles.name),
        email = COALESCE(EXCLUDED.email, public.profiles.email);
  RETURN NEW;
END;
$$;

-- 3. Poblar email en perfiles existentes (migración de datos)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- 4. Política: admin puede actualizar cualquier perfil (ya incluye disabled)
--    La política existente "profiles_update" ya cubre esto. Solo verificar:
--    USING (id = auth.uid() OR is_admin())
--    Si no existe, crearla:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'profiles_update'
  ) THEN
    CREATE POLICY "profiles_update" ON public.profiles
      FOR UPDATE TO authenticated
      USING (id = auth.uid() OR is_admin())
      WITH CHECK (id = auth.uid() OR is_admin());
  END IF;
END $$;
