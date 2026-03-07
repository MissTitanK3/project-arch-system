export type OperationResult<T> = {
  success: boolean;
  data?: T;
  errors?: string[];
};
