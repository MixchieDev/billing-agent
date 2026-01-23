import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET all email templates
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templates = await prisma.emailTemplate.findMany({
      include: {
        partners: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' }, // Default template first
        { name: 'asc' },
      ],
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email templates' },
      { status: 500 }
    );
  }
}

// POST create new email template
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can create templates
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, subject, greeting, body: bodyText, closing, isDefault, templateType, followUpLevel } = body;

    // Validate required fields
    if (!name || !subject || !greeting || !bodyText || !closing) {
      return NextResponse.json(
        { error: 'Missing required fields: name, subject, greeting, body, closing' },
        { status: 400 }
      );
    }

    // For follow-up templates, check by templateType + followUpLevel instead of name
    if (templateType === 'FOLLOW_UP' && followUpLevel) {
      const existingFollowUp = await prisma.emailTemplate.findFirst({
        where: { templateType: 'FOLLOW_UP', followUpLevel },
      });
      if (existingFollowUp) {
        // Update existing follow-up template instead of creating duplicate
        const updated = await prisma.emailTemplate.update({
          where: { id: existingFollowUp.id },
          data: { name, subject, greeting, body: bodyText, closing },
        });
        return NextResponse.json(updated, { status: 200 });
      }
    } else {
      // Check for duplicate name for non-follow-up templates
      const existing = await prisma.emailTemplate.findUnique({
        where: { name },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'A template with this name already exists' },
          { status: 400 }
        );
      }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.emailTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.emailTemplate.create({
      data: {
        name,
        subject,
        greeting,
        body: bodyText,
        closing,
        isDefault: isDefault || false,
        templateType: templateType || 'BILLING',
        followUpLevel: followUpLevel || null,
      },
      include: {
        partners: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Error creating email template:', error);
    return NextResponse.json(
      { error: 'Failed to create email template' },
      { status: 500 }
    );
  }
}
