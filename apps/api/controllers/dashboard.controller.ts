import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { DayAndCount } from '../schema/dashboard/executions.schema';
import { PrismaService } from '#lib/core/services';
import { DashboardOutputSchema } from '../schema';
import { Protected } from '#lib/auth/decorators';
import { Prisma } from '@prisma/client';

@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('/')
  @Protected('OBSERVER')
  @ApiQuery({
    name: 'timezone',
    required: true,
    description: 'The timezone for the dashboard data (IANA format)',
    example: 'America/New_York',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'The start date for the dashboard data (ISO 8601 format)',
    example: '2023-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'The end date for the dashboard data (ISO 8601 format)',
    example: '2023-01-31T23:59:59.999Z',
  })
  @ApiOperation({
    summary: 'Get dashboard data',
    description: 'Retrieve various statistics and metrics for the dashboard.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully.',
    type: DashboardOutputSchema,
  })
  async index(
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ): Promise<DashboardOutputSchema> {
    if (!startDate) {
      throw new BadRequestException(`'startDate' and 'timezone' are required`);
    }

    startDate = new Date(startDate);

    if (endDate) {
      endDate = new Date(endDate);
    } else {
      endDate = new Date();
      endDate.setUTCHours(23, 59, 59, 999);
    }

    if (!startDate.getDate() || !endDate.getDate()) {
      throw new BadRequestException(
        `'startDate' or 'endDate' is not a valid date`,
      );
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setUTCMonth(new Date().getUTCMonth() - 5, 1);
    sixMonthsAgo.setUTCHours(0, 0, 0, 0);

    const { result: totalExecutions } = await this.prisma.job.count({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: ['FAILED', 'CANCELLED', 'SUCCEEDED'],
        },
      },
    });

    const workflows = await this.prisma.$queryRaw`
      with job_base as
             (select j."id",
                     j."workflowId",
                     j."createdAt",
                     j."updatedAt",
                     EXTRACT(EPOCH
                             from (j."updatedAt" - j."createdAt")) * 1000 as duration_ms
              from "Job" j
              where j."status" in ('FAILED',
                                   'CANCELLED',
                                   'SUCCEEDED')
                and j."createdAt" >= ${startDate}
                and j."createdAt" <= ${endDate}),
           daily as
             (select jb."workflowId",
                     date_trunc('day', jb."createdAt" at time zone 'utc') as day_utc,
                     COUNT(*)::int                                        as cnt,
                     AVG(jb.duration_ms)                                  as avg_duration
              from job_base jb
              group by jb."workflowId",
                       day_utc),
           daily_json as
             (select d."workflowId",
                     jsonb_agg(
                       jsonb_build_object(
                         'date', to_char(d.day_utc, 'YYYY-MM-DD"T"00:00:00.000"Z"'), 'count', d.cnt,
                         'averageDuration', d.avg_duration)
                       order by d.day_utc) as daily_counts
              from daily d
              group by d."workflowId")
      select w.id                                   as "id",
             w.name                                 as "name",
             w.active                               as "active",
             COALESCE(COUNT(jb.id), 0)::int         as "count",
             COALESCE(AVG(jb.duration_ms), 0)       as "averageDuration",
             COALESCE(dj.daily_counts, '[]'::jsonb) as "dailyCounts"
      from "Workflow" w
             left join job_base jb on jb."workflowId" = w.id
             left join daily_json dj on dj."workflowId" = w.id
      group by w.id,
               w.name,
               w.active,
               dj.daily_counts
      order by "count" desc
      limit 20;`;

    const byDay = await this.prisma.$queryRaw`
      select date_trunc('day', "createdAt") as date, count(*) as count
      from "Job"
      where "createdAt" >= ${startDate}
        and "createdAt" <= ${endDate}
        and "status" in ('FAILED', 'CANCELLED', 'SUCCEEDED')
      group by date
      order by date;
    `;

    const byDayStatus = await this.prisma.$queryRaw`
      select date_trunc('day', "createdAt") as date, status, count(*) as count
      from "Job"
      where "createdAt" >= ${startDate} ${endDate ? Prisma.sql`and "createdAt" <= ${endDate}` : Prisma.empty}
      and "status" in ('FAILED', 'CANCELLED', 'SUCCEEDED')
      group by date, status
      order by date;
    `.then((rows: Array<{ date: Date; status: string; count: number }>) => {
      const grouped: Record<string, any> = {};

      for (const row of rows) {
        if (!grouped[row.status]) {
          grouped[row.status] = [];
        }

        (grouped[row.status] as any[]).push(row);
        // @ts-expect-error - we don't need status in the final output
        delete row.status;
      }

      return grouped;
    });

    const byDayTrigger = await this.prisma.$queryRaw`
      select date_trunc('day', "createdAt") as date, trigger, count(*) as count
      from "Job"
      where "createdAt" >= ${startDate}
        and "createdAt" <= ${endDate}
      group by date, trigger
      order by date;
    `.then((rows: Array<{ date: Date; trigger: string; count: number }>) => {
      const grouped: Record<string, any> = {};

      for (const row of rows) {
        if (!grouped[row.trigger]) {
          grouped[row.trigger] = [];
        }

        (grouped[row.trigger] as any[]).push(row);
        // @ts-expect-error - we don't need trigger in the final output
        delete row.trigger;
      }

      return grouped;
    });

    const last6MonthsByMonthStatus = await this.prisma.$queryRaw`
      select date_trunc('month', "createdAt") as date, status, count(*) as count
      from "Job"
      where "createdAt" >= ${sixMonthsAgo}
        and "status" in ('FAILED', 'CANCELLED', 'SUCCEEDED')
      group by date, status
      order by date;
    `.then((rows: Array<{ date: Date; status: string; count: number }>) => {
      const grouped: Record<string, any> = {};

      for (const row of rows) {
        if (!grouped[row.status]) {
          grouped[row.status] = [];
        }

        (grouped[row.status] as any[]).push(row);
        // @ts-expect-error - we don't need status in the final output
        delete row.status;
      }

      return grouped;
    });

    for (const status in byDayStatus) {
      byDayStatus[status] = this.addMissingDates(
        byDayStatus[status] as DayAndCount[],
        'date',
        startDate,
        endDate,
        'day',
        (date) => ({ date: date.toISOString(), count: '0' }),
      );
    }

    for (const status in byDayTrigger) {
      byDayTrigger[status] = this.addMissingDates(
        byDayTrigger[status] as DayAndCount[],
        'date',
        startDate,
        endDate,
        'day',
        (date) => ({ date: date.toISOString(), count: '0' }),
      );
    }

    for (const status in last6MonthsByMonthStatus) {
      last6MonthsByMonthStatus[status] = this.addMissingDates(
        last6MonthsByMonthStatus[status] as DayAndCount[],
        'date',
        sixMonthsAgo,
        endDate,
        'month',
        (date) => ({
          date: date.toISOString(),
          count: '0',
        }),
      );
    }

    for (const workflow of workflows as DashboardOutputSchema['executions']['workflows']) {
      workflow.dailyCounts = this.addMissingDates(
        workflow.dailyCounts,
        'date',
        startDate,
        endDate,
        'day',
        (date) => ({
          date: date.toISOString(),
          count: '0',
          averageDuration: '0',
        }),
      );
    }

    return {
      executions: {
        total: totalExecutions,
        workflows:
          workflows as DashboardOutputSchema['executions']['workflows'],
        byDay: this.addMissingDates(
          byDay as DashboardOutputSchema['executions']['byDay'],
          'date',
          startDate,
          endDate,
          'day',
          (date) => ({ date: date.toISOString(), count: '0' }),
        ),
        byTriggerDay: byDayTrigger,
        byStatusDay: byDayStatus,
        byStatusMonth: last6MonthsByMonthStatus,
      },
    };
  }

  private addMissingDates<T = any>(
    data: T,
    dateKey: T extends Array<infer K> ? keyof K : never,
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'month',
    fillValue: (date: Date) => T extends Array<infer K> ? K : never,
  ) {
    const result: Array<T extends Array<infer K> ? K : never> = [];
    const dateMap = new Map<string, T extends Array<infer K> ? K : never>();

    for (const item of data as Array<T extends Array<infer K> ? K : never>) {
      const date = new Date(item[dateKey] as unknown as string);
      const key = date.toISOString().split('T')[0];
      dateMap.set(key, item);
    }

    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const key = currentDate.toISOString().split('T')[0];

      if (dateMap.has(key)) {
        result.push(dateMap.get(key)!);
      } else {
        result.push(fillValue(new Date(currentDate)));
      }

      if (interval === 'day') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (interval === 'month') {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    return result;
  }
}
