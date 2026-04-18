import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

function getUzbekistanTime() {
  const now = new Date();
  // UTC vaqtga 5 soat qo'shish (Toshkent vaqti +5 UTC)
  return new Date(now.getTime() + 5 * 60 * 60 * 1000);
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();

    // Prisma orqali DBga yozishdan oldin vaqtni avtomatik O'zbekiston vaqtiga o'tkazish
    this.$use(async (params, next) => {
      const isCreate =
        params.action === 'create' || params.action === 'createMany';
      const isUpdate =
        params.action === 'update' || params.action === 'updateMany';

      const modelName = params.model || '';
      const hasCreatedAt = ['User', 'Category', 'Product', 'Cart', 'Order'].includes(modelName);
      const hasUpdatedAt = ['User', 'Category', 'Product', 'Cart'].includes(modelName);

      if (isCreate) {
        if (params.args.data) {
          if (Array.isArray(params.args.data)) {
            params.args.data = params.args.data.map((item) => {
              const newItem = { ...item };
              if (hasCreatedAt) newItem.createdAt = item.createdAt || getUzbekistanTime();
              if (hasUpdatedAt) newItem.updatedAt = item.updatedAt || getUzbekistanTime();
              return newItem;
            });
          } else {
            if (hasCreatedAt) params.args.data.createdAt = params.args.data.createdAt || getUzbekistanTime();
            if (hasUpdatedAt) params.args.data.updatedAt = params.args.data.updatedAt || getUzbekistanTime();
          }
        }
      }

      if (isUpdate) {
        if (params.args.data) {
          if (Array.isArray(params.args.data)) {
            params.args.data = params.args.data.map((item) => {
              const newItem = { ...item };
              if (hasUpdatedAt) newItem.updatedAt = getUzbekistanTime();
              return newItem;
            });
          } else {
            if (hasUpdatedAt) params.args.data.updatedAt = getUzbekistanTime();
          }
        }
      }

      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
