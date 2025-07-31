import { ListInputSchema, ListOutputSchema } from '../schema';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '#lib/core/services';
import { merge } from 'lodash-es';

export async function listData<
  M extends Prisma.TypeMap['meta']['modelProps'],
  A extends Prisma.Args<PrismaService[M], 'findMany'>,
  D = Prisma.Result<PrismaService[M], A, 'findMany'>,
>(
  prisma: PrismaService,
  model: M,
  input: ListInputSchema,
  searchFields?: (keyof PrismaClient[M]['fields'])[],
  args?: A,
): Promise<ListOutputSchema<D>> {
  const { page = 1, limit = 10 } = input;

  const where = {
    AND: [
      input.search && searchFields
        ? {
            OR: searchFields.map((field) => ({
              [field]: { contains: input.search, mode: 'insensitive' },
            })),
          }
        : {},
      input.filter ?? {},
    ],
  };

  const { result: count } = await prisma[model].count({ where });

  const { result: data } = await prisma[model].findMany(
    merge(
      {
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          [input.sortField || 'createdAt']: input.sortOrder || 'desc',
        },
      },
      args,
    ),
  );

  return {
    data: data as D,
    count,
    page,
    limit,
    pages: Math.ceil(count / limit),
    hasNext: page * limit < count,
    hasPrev: page > 1,
  };
}
