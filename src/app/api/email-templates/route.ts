import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

// GET all email templates
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templates = await convexClient.query(api.emailTemplates.listWithPartners, {});

    // Sort: default template first, then by name
    const sorted = [...templates].sort((a: any, b: any) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    // Map _id to id for compatibility
    const mapped = sorted.map((t: any) => ({
      ...t,
      id: t._id,
    }));

    return NextResponse.json(mapped);
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
      const existingFollowUp = await convexClient.query(api.emailTemplates.getFollowUpByLevel, { level: followUpLevel });
      if (existingFollowUp) {
        // Update existing follow-up template instead of creating duplicate
        const updated = await convexClient.mutation(api.emailTemplates.update, {
          id: existingFollowUp._id as any,
          data: { name, subject, greeting, body: bodyText, closing },
        });
        return NextResponse.json({ ...updated, id: updated?._id }, { status: 200 });
      }
    } else {
      // Check for duplicate name for non-follow-up templates
      const existing = await convexClient.query(api.emailTemplates.getByName, { name });
      if (existing) {
        return NextResponse.json(
          { error: 'A template with this name already exists' },
          { status: 400 }
        );
      }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await convexClient.mutation(api.emailTemplates.clearDefaults, {});
    }

    const templateId = await convexClient.mutation(api.emailTemplates.create, {
      name,
      subject,
      greeting,
      body: bodyText,
      closing,
      isDefault: isDefault || false,
      templateType: templateType || 'BILLING',
      followUpLevel: followUpLevel || undefined,
    });

    // Fetch the created template with partners
    const template = await convexClient.query(api.emailTemplates.getWithPartners, { id: templateId as any });

    return NextResponse.json({ ...template, id: template?._id }, { status: 201 });
  } catch (error) {
    console.error('Error creating email template:', error);
    return NextResponse.json(
      { error: 'Failed to create email template' },
      { status: 500 }
    );
  }
}
