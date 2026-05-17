import { NextRequest, NextResponse } from 'next/server';
import { searchCompanies } from '@/service/search';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const results = await searchCompanies(q);
  return NextResponse.json(results);
}
