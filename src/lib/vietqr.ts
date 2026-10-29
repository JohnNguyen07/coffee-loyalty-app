import QRCode from 'qrcode';

export interface VietQrConfig {
  bankId: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  template?: string;
}

export const DEFAULT_VIETQR_CONFIG: VietQrConfig = {
  bankId: process.env.NEXT_PUBLIC_VIETQR_BANK_ID || 'MB',
  bankName: process.env.NEXT_PUBLIC_VIETQR_BANK_NAME || 'MBBank (Ngân hàng Quân Đội)',
  accountNo: process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO || '0907960109',
  accountName: process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME || 'U LAB SPECIALTY COLD BREW',
  template: 'compact2',
};

/**
 * Builds a dynamic VietQR image URL recognized by all Vietnam banking apps
 */
export function buildVietQrImageUrl(params: {
  amount: number;
  description: string;
  bankId?: string;
  accountNo?: string;
  accountName?: string;
  template?: string;
}): string {
  const bank = params.bankId || DEFAULT_VIETQR_CONFIG.bankId;
  const acc = params.accountNo || DEFAULT_VIETQR_CONFIG.accountNo;
  const tpl = params.template || DEFAULT_VIETQR_CONFIG.template || 'compact2';
  const name = encodeURIComponent(params.accountName || DEFAULT_VIETQR_CONFIG.accountName);
  const desc = encodeURIComponent(params.description.slice(0, 50));
  const amount = Math.max(0, Math.round(params.amount));

  return `https://img.vietqr.io/image/${bank}-${acc}-${tpl}.png?amount=${amount}&addInfo=${desc}&accountName=${name}`;
}

/**
 * Generates an offline data URL using local QRCode library as reliable fallback
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 320,
      margin: 2,
      color: {
        dark: '#006241',
        light: '#FFFFFF',
      },
    });
  } catch {
    return '';
  }
}

