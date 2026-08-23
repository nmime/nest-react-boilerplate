export interface PaymentsDto {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreatePaymentsDto {
  name: string;
}

export const PaymentsReadPermission = 'payments:read';
export const PaymentsWritePermission = 'payments:write';
