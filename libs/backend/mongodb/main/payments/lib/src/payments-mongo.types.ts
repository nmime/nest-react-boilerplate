export interface PaymentsDocument {
  _id: string;
  name: string;
  createdAt: Date;
}

export interface PaymentsEntity {
  id: string;
  name: string;
  createdAt: Date;
}

export interface PaymentsRepositoryError {
  code: 'repository_error';
}
