import { formatVND } from '@/data/menu';
import type { PosOrderRecord } from './repository';

const ORDER_TYPE_LABEL: Record<string, string> = {
  TAKEAWAY: 'Mang đi (Takeaway)',
  DINE_IN: 'Dùng tại quán (Dine-in)',
  DELIVERY: 'Giao hàng (Delivery)',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản QR',
  EWALLET: 'Ví điện tử',
};

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate printable HTML for Phiếu Pha Chế (Barista Ticket & Cup Labels).
 */
export function buildBaristaTicketHtml(order: PosOrderRecord, locationName = 'Ủ LAB — Quầy Chính'): string {
  const timeStr = new Date(order.createdAt).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Expand each item quantity into individual cup stickers so barista can stick one per cup
  const expandedCups: {
    cupIndex: number;
    totalCups: number;
    productName: string;
    sizeLabel: string;
    optionsSummary: string;
  }[] = [];

  const totalCups = order.items.reduce((sum, it) => sum + it.quantity, 0);
  let counter = 1;
  for (const item of order.items) {
    for (let i = 0; i < item.quantity; i++) {
      expandedCups.push({
        cupIndex: counter++,
        totalCups,
        productName: item.productName,
        sizeLabel: item.sizeLabel,
        optionsSummary: item.optionsSummary || '100% đường · 100% đá',
      });
    }
  }

  const cupsHtml = expandedCups
    .map(
      (cup) => `
      <div class="cup-ticket">
        <div class="cup-top">
          <span class="order-code">#${escapeHtml(order.orderCode)}</span>
          <span class="cup-seq">Ly ${cup.cupIndex}/${cup.totalCups}</span>
        </div>
        <div class="order-type">${escapeHtml(ORDER_TYPE_LABEL[order.orderType] || order.orderType)} · ${escapeHtml(timeStr)}</div>
        <div class="drink-title">
          <span class="drink-name">${escapeHtml(cup.productName)}</span>
          <span class="drink-size">Size ${escapeHtml(cup.sizeLabel)}</span>
        </div>
        <div class="drink-options">${escapeHtml(cup.optionsSummary)}</div>
        ${order.note ? `<div class="order-note">Ghi chú đơn: ${escapeHtml(order.note)}</div>` : ''}
        <div class="cup-footer">${escapeHtml(locationName)} · KH: ${escapeHtml(order.customerName)}</div>
      </div>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Phiếu Pha Chế #${escapeHtml(order.orderCode)} - Ủ LAB</title>
      <style>
        @page {
          size: 80mm auto;
          margin: 2mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          width: 74mm;
          margin: 0 auto;
          color: #111827;
          background: #FFFFFF;
        }
        .cup-ticket {
          border: 1.5px solid #1E3932;
          border-radius: 6px;
          padding: 3.5mm;
          margin-bottom: 3.5mm;
          page-break-inside: avoid;
        }
        .cup-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px dashed #9CA3AF;
          padding-bottom: 1.5mm;
          margin-bottom: 1.5mm;
        }
        .order-code {
          font-size: 12pt;
          font-weight: 900;
          font-family: monospace;
          color: #1E3932;
        }
        .cup-seq {
          font-size: 10pt;
          font-weight: 800;
          background: #1E3932;
          color: #FFFFFF;
          padding: 1px 6px;
          border-radius: 4px;
        }
        .order-type {
          font-size: 8pt;
          font-weight: 600;
          color: #4B5563;
          margin-bottom: 2mm;
        }
        .drink-title {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 6px;
          margin-bottom: 1.5mm;
        }
        .drink-name {
          font-size: 12pt;
          font-weight: 800;
          color: #000000;
        }
        .drink-size {
          font-size: 10pt;
          font-weight: 800;
          color: #006241;
          white-space: nowrap;
        }
        .drink-options {
          font-size: 9.5pt;
          font-weight: 700;
          color: #1F2937;
          background: #F3F4F6;
          padding: 2mm;
          border-radius: 4px;
          margin-bottom: 1.5mm;
        }
        .order-note {
          font-size: 8.5pt;
          font-weight: 700;
          color: #B45309;
          margin-bottom: 1.5mm;
        }
        .cup-footer {
          font-size: 7.5pt;
          color: #6B7280;
          border-top: 1px dotted #D1D5DB;
          padding-top: 1mm;
        }
      </style>
    </head>
    <body>
      ${cupsHtml}
      <script>
        window.onload = function() {
          window.focus();
          window.print();
          window.close();
        };
      </script>
    </body>
    </html>
  `;
}

/**
 * Generate printable HTML for Biên Nhận Thanh Toán (Customer Thermal Receipt 80mm).
 */
export function buildCustomerReceiptHtml(
  order: PosOrderRecord,
  qrDataUrl?: string,
  locationName = 'Ủ LAB — Quầy Chính'
): string {
  const timeStr = new Date(order.createdAt).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const rowsHtml = order.items
    .map(
      (it) => `
      <tr>
        <td class="item-col">
          <div class="item-name">${escapeHtml(it.productName)} (${escapeHtml(it.sizeLabel)})</div>
          ${it.optionsSummary ? `<div class="item-opt">${escapeHtml(it.optionsSummary)}</div>` : ''}
        </td>
        <td class="qty-col">${it.quantity}</td>
        <td class="price-col">${formatVND(it.unitPrice)}</td>
        <td class="total-col">${formatVND(it.subtotal)}</td>
      </tr>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Biên Nhận #${escapeHtml(order.orderCode)} - Ủ LAB</title>
      <style>
        @page {
          size: 80mm auto;
          margin: 2mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          width: 72mm;
          margin: 0 auto;
          padding: 2mm 0;
          color: #111827;
          background: #FFFFFF;
          font-size: 9pt;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          border-bottom: 1.5px dashed #1E3932;
          padding-bottom: 3mm;
          margin-bottom: 3mm;
        }
        .brand {
          font-size: 14pt;
          font-weight: 900;
          letter-spacing: 0.06em;
          color: #1E3932;
        }
        .loc {
          font-size: 8.5pt;
          font-weight: 600;
          color: #4B5563;
        }
        .receipt-title {
          font-size: 11pt;
          font-weight: 800;
          margin-top: 2mm;
          text-transform: uppercase;
        }
        .meta {
          margin-bottom: 3mm;
          font-size: 8.5pt;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1mm;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 3mm;
        }
        th {
          border-top: 1px solid #111827;
          border-bottom: 1px solid #111827;
          padding: 1.5mm 0;
          font-size: 8pt;
          text-align: left;
        }
        td {
          padding: 1.5mm 0;
          vertical-align: top;
          border-bottom: 1px dotted #E5E7EB;
        }
        .item-name {
          font-weight: 700;
          font-size: 9pt;
        }
        .item-opt {
          font-size: 7.5pt;
          color: #4B5563;
        }
        .qty-col {
          text-align: center;
          width: 10mm;
          font-weight: 700;
        }
        .price-col {
          text-align: right;
          width: 16mm;
          font-size: 8pt;
        }
        .total-col {
          text-align: right;
          width: 18mm;
          font-weight: 700;
        }
        .summary {
          border-top: 1px dashed #111827;
          padding-top: 2mm;
          margin-bottom: 3mm;
        }
        .sum-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1mm;
          font-size: 9pt;
        }
        .sum-total {
          font-size: 12pt;
          font-weight: 900;
          color: #1E3932;
          border-top: 1px solid #111827;
          border-bottom: 1px solid #111827;
          padding: 1.5mm 0;
          margin: 1.5mm 0;
        }
        .qr-box {
          text-align: center;
          border: 1px dashed #006241;
          border-radius: 6px;
          padding: 2.5mm;
          margin-top: 3mm;
        }
        .qr-img {
          width: 34mm;
          height: 34mm;
          margin: 1.5mm auto;
          display: block;
        }
        .footer {
          text-align: center;
          font-size: 8pt;
          color: #4B5563;
          margin-top: 3mm;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">Ủ LAB</div>
        <div class="loc">${escapeHtml(locationName)}</div>
        <div class="receipt-title">Biên Nhận Thanh Toán</div>
      </div>

      <div class="meta">
        <div class="meta-row"><span>Mã đơn:</span><strong>#${escapeHtml(order.orderCode)}</strong></div>
        <div class="meta-row"><span>Thời gian:</span><span>${escapeHtml(timeStr)}</span></div>
        <div class="meta-row"><span>Hình thức:</span><span>${escapeHtml(ORDER_TYPE_LABEL[order.orderType] || order.orderType)}</span></div>
        <div class="meta-row"><span>Thu ngân:</span><span>${escapeHtml(order.cashierName)}</span></div>
        <div class="meta-row"><span>Khách hàng:</span><span>${escapeHtml(order.customerName)}${order.customerPhone ? ` (${escapeHtml(order.customerPhone)})` : ''}</span></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Món</th>
            <th class="qty-col">SL</th>
            <th class="price-col">Đ.Giá</th>
            <th class="total-col">T.Tiền</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="summary">
        <div class="sum-row">
          <span>Tạm tính:</span>
          <span>${formatVND(order.subtotal)}</span>
        </div>
        ${
          order.discountAmount > 0
            ? `<div class="sum-row">
                <span>Giảm giá (${order.discountPercent}%${order.discountReason ? ` - ${escapeHtml(order.discountReason)}` : ''}):</span>
                <span>-${formatVND(order.discountAmount)}</span>
              </div>`
            : ''
        }
        ${
          order.pointsUsed > 0
            ? `<div class="sum-row">
                <span>Trừ điểm thành viên:</span>
                <span>-${formatVND(order.pointsUsed)}</span>
              </div>`
            : ''
        }
        <div class="sum-row sum-total">
          <span>TỔNG THANH TOÁN:</span>
          <span>${formatVND(order.totalDue)}</span>
        </div>
        <div class="sum-row">
          <span>Phương thức:</span>
          <strong>${escapeHtml(PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod)}</strong>
        </div>
        <div class="sum-row">
          <span>Khách đưa:</span>
          <span>${formatVND(order.amountReceived)}</span>
        </div>
        <div class="sum-row">
          <span>Tiền thừa:</span>
          <strong>${formatVND(order.changeDue)}</strong>
        </div>
      </div>

      ${
        qrDataUrl && order.qrTokenCode
          ? `<div class="qr-box">
              <div><strong>QUÉT QR TÍCH ĐIỂM Ủ LAB REWARDS</strong></div>
              <img class="qr-img" src="${qrDataUrl}" alt="QR Tích điểm" />
              <div style="font-size:7.5pt;font-family:monospace;">${escapeHtml(order.qrTokenCode)}</div>
              <div style="font-size:7.5pt;">Mở Camera ĐT quét nhận hoàn điểm 3% – 10%</div>
            </div>`
          : ''
      }

      <div class="footer">
        Cảm ơn quý khách đã ghé Ủ LAB!<br/>
        Hẹn gặp lại quý khách lần sau.
      </div>

      <script>
        window.onload = function() {
          window.focus();
          window.print();
          window.close();
        };
      </script>
    </body>
    </html>
  `;
}

