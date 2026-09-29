/* Erreurs typées : distinguer validation, permission, réseau, API, stockage.
   L'UI affiche toUserMessage(error) ; le détail technique part dans le logger. */

class AppError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = 'AppError';
    this.userMessage = userMessage;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PermissionError extends AppError {
  constructor(message = 'Vous n’avez pas les droits pour effectuer cette opération.') {
    super(message);
    this.name = 'PermissionError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Identifiant ou mot de passe incorrect.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'L’élément demandé') {
    super(`${what} est introuvable. Il a peut-être été supprimé.`);
    this.name = 'NotFoundError';
  }
}

export class NetworkError extends AppError {
  constructor(cause?: unknown) {
    super('Connexion au serveur impossible. Vérifiez le réseau puis réessayez.', { cause });
    this.name = 'NetworkError';
  }
}

export class ApiError extends AppError {
  readonly status: number;
  constructor(status: number, detail?: string) {
    super(
      status === 401
        ? 'Votre session a expiré. Reconnectez-vous.'
        : status === 403
          ? 'Accès refusé par le serveur.'
          : status === 404
            ? 'Ressource introuvable sur le serveur.'
            : status >= 500
              ? 'Le serveur a rencontré une erreur. Réessayez dans un instant.'
              : 'La requête a été refusée par le serveur.',
      { cause: detail },
    );
    this.name = 'ApiError';
    this.status = status;
  }
}

export class StorageError extends AppError {
  constructor(cause?: unknown) {
    super('Enregistrement impossible : le stockage local du navigateur est plein ou bloqué.', { cause });
    this.name = 'StorageError';
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage;
  return 'Une erreur inattendue est survenue. Réessayez ; si le problème persiste, contactez l’administrateur.';
}
