/* ============================================================
   DATA.JS — Supabase async CRUD layer
   Reemplaza el sistema localStorage anterior
   ============================================================ */

const DB_KEYS = {
  products:           'products',
  customers:          'customers',
  sales:              'sales',
  saleItems:          'sale_items',
  expenses:           'expenses',
  receivables:        'receivables',
  receivablePayments: 'receivable_payments',
  quotes:             'quotes',
  quoteItems:         'quote_items',
  profiles:           'profiles',
};

// ---- Generic helpers ----

async function dbGetAll(table) {
  const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function dbInsert(table, row) {
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

async function dbUpdateRow(table, id, updates) {
  const { data, error } = await sb.from(table).update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function dbDeleteRow(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
}

async function dbFindById(table, id) {
  const { data, error } = await sb.from(table).select('*').eq('id', id).single();
  if (error) return null;
  return data;
}

// ---- Specialized fetch functions (with embedded relations) ----

async function fetchProducts() {
  const { data, error } = await sb
    .from('products')
    .select('*')
    .order('name');
  if (error) throw error;
  return data || [];
}

async function fetchCustomers() {
  let q = sb.from('customers').select('*').order('name');
  // Vendedores solo ven sus propios clientes (RLS lo filtra automáticamente)
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchSales() {
  const { data, error } = await sb
    .from('sales')
    .select('*, sale_items(*)')
    .order('date', { ascending: false });
  if (error) throw error;
  // Normalizar nombre de campo items para compatibilidad
  return (data || []).map(s => ({ ...s, items: s.sale_items || [] }));
}

async function fetchExpenses() {
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchReceivables() {
  const { data, error } = await sb
    .from('receivables')
    .select('*, receivable_payments(*)')
    .order('due_date', { ascending: true });
  if (error) throw error;
  return (data || []).map(r => ({ ...r, payments: r.receivable_payments || [] }));
}

async function fetchQuotes() {
  const { data, error } = await sb
    .from('quotes')
    .select('*, quote_items(*)')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(q => ({ ...q, items: q.quote_items || [] }));
}

async function fetchProfiles() {
  const { data, error } = await sb.from('profiles').select('*').order('name');
  if (error) throw error;
  return data || [];
}

async function fetchPurchases() {
  const { data, error } = await sb
    .from('purchases')
    .select('*, purchase_items(*)')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(p => ({ ...p, items: p.purchase_items || [] }));
}

// ---- Sale with items (single) ----
async function fetchSaleById(id) {
  const { data, error } = await sb
    .from('sales')
    .select('*, sale_items(*)')
    .eq('id', id)
    .single();
  if (error) return null;
  return { ...data, items: data.sale_items || [] };
}

// ---- Quote with items (single) ----
async function fetchQuoteById(id) {
  const { data, error } = await sb
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', id)
    .single();
  if (error) return null;
  return { ...data, items: data.quote_items || [] };
}

// ---- Receivable with payments (single) ----
async function fetchReceivableById(id) {
  const { data, error } = await sb
    .from('receivables')
    .select('*, receivable_payments(*)')
    .eq('id', id)
    .single();
  if (error) return null;
  return { ...data, payments: data.receivable_payments || [] };
}

// ---- Insert sale + items (two-step) ----
async function insertSaleWithItems(saleData, items) {
  const sale = await dbInsert('sales', saleData);
  if (items.length > 0) {
    const rows = items.map(i => ({ ...i, sale_id: sale.id }));
    const { error } = await sb.from('sale_items').insert(rows);
    if (error) {
      // Compensate: delete the orphaned sale
      await dbDeleteRow('sales', sale.id);
      throw error;
    }
  }
  return sale;
}

// ---- Insert quote + items ----
async function insertQuoteWithItems(quoteData, items) {
  const quote = await dbInsert('quotes', quoteData);
  if (items.length > 0) {
    const rows = items.map(i => ({ ...i, quote_id: quote.id }));
    const { error } = await sb.from('quote_items').insert(rows);
    if (error) {
      await dbDeleteRow('quotes', quote.id);
      throw error;
    }
  }
  return quote;
}

// ---- Update sale + replace items ----
async function updateSaleWithItems(id, saleData, items) {
  const sale = await dbUpdateRow('sales', id, saleData);
  // Delete old items and re-insert
  await sb.from('sale_items').delete().eq('sale_id', id);
  if (items.length > 0) {
    const rows = items.map(i => ({ ...i, sale_id: id }));
    const { error } = await sb.from('sale_items').insert(rows);
    if (error) throw error;
  }
  return sale;
}

// ---- Update quote + replace items ----
async function updateQuoteWithItems(id, quoteData, items) {
  const quote = await dbUpdateRow('quotes', id, quoteData);
  await sb.from('quote_items').delete().eq('quote_id', id);
  if (items.length > 0) {
    const rows = items.map(i => ({ ...i, quote_id: id }));
    const { error } = await sb.from('quote_items').insert(rows);
    if (error) throw error;
  }
  return quote;
}

// ---- RPC: apply payment (atomic, see sql/schema.sql) ----
async function rpcApplyPayment(receivableId, amount, date, method, notes) {
  const { error } = await sb.rpc('apply_payment', {
    p_receivable_id: receivableId,
    p_amount: amount,
    p_date: date,
    p_method: method,
    p_notes: notes || '',
  });
  if (error) throw error;
}

// ---- RPC: register_purchase (atomic) ----
async function rpcRegisterPurchase(purchaseData, items) {
  const { data, error } = await sb.rpc('register_purchase', {
    p_supplier:        purchaseData.supplier,
    p_date:            purchaseData.date,
    p_payment_method:  purchaseData.payment_method,
    p_invoice_number:  purchaseData.invoice_number || '',
    p_notes:           purchaseData.notes || '',
    p_total:           purchaseData.total,
    p_user_id:         purchaseData.user_id,
    p_items:           items.map(i => ({
      product_id:   i.product_id,
      product_name: i.product_name,
      quantity:     i.quantity,
      unit_price:   i.unit_price,
      subtotal:     i.subtotal,
    })),
  });
  if (error) throw error;
  return data;
}

// ---- RPC: convert quote to sale (atomic) ----
async function rpcConvertQuoteToSale(quoteId) {
  const { data, error } = await sb.rpc('convert_quote_to_sale', {
    p_quote_id: quoteId,
  });
  if (error) throw error;
  return data; // returns new sale UUID
}

// ---- Utility ----
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function genId() {
  // Kept for backward compatibility in HTML templates; Supabase uses UUIDs
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
