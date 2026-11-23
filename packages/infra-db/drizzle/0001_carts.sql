CREATE TABLE `coupons` (
	`code` text PRIMARY KEY NOT NULL,
	`discount_kind` text NOT NULL,
	`percent` integer,
	`amount_minor` integer,
	`usage_limit` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`redemptions` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`discount_minor` integer NOT NULL,
	`promotion_id` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_lines_order_id_idx` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`discount_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`coupon_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coupon_code`) REFERENCES `coupons`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_user_id_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`percent` integer,
	`active` integer DEFAULT true NOT NULL,
	`redemptions` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
