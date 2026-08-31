export type AccountDeletionMail = {
  to: string;
  confirmUrl: string;
};

export abstract class AccountDeletionMailer {
  abstract isConfigured(): boolean;
  abstract sendDeletionLink(mail: AccountDeletionMail): Promise<void>;
}
