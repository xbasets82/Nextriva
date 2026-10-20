import { Injectable } from '@nestjs/common';
import {
  newPromotion,
  promotionChanges,
  promotionId,
  promotionStatus,
} from './promotion.validation.js';
import { PromotionsStore } from './promotions.store.js';

@Injectable()
export class PromotionsService {
  constructor(private readonly promotions: PromotionsStore) {}

  create(actorId: string, body: unknown) {
    return this.promotions.create(actorId, newPromotion(body));
  }

  list(actorId: string) {
    return this.promotions.list(actorId);
  }

  get(actorId: string, id: string) {
    return this.promotions.get(actorId, promotionId(id));
  }

  edit(actorId: string, id: string, body: unknown) {
    return this.promotions.edit(
      actorId,
      promotionId(id),
      promotionChanges(body),
    );
  }

  setStatus(actorId: string, id: string, body: unknown) {
    return this.promotions.setStatus(
      actorId,
      promotionId(id),
      promotionStatus(body),
    );
  }
}
