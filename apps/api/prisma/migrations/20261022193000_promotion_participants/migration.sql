CREATE TABLE "promotion_participants" (
    "promotion_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_participants_pkey" PRIMARY KEY ("promotion_id", "user_id"),
    CONSTRAINT "promotion_participants_promotion_id_fkey" FOREIGN KEY ("promotion_id")
        REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "promotion_participants_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "promotion_participants_user_id_promotion_id_idx"
    ON "promotion_participants"("user_id", "promotion_id");
