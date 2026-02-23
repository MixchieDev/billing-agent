import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

// GET single email template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const template = await convexClient.query(api.emailTemplates.getWithPartners, { id: id as any });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ ...template, id: template._id });
  } catch (error) {
    console.error('Error fetching email template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email template' },
      { status: 500 }
    );
  }
}

// PUT update email template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can update templates
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, subject, greeting, body: bodyText, closing, isDefault } = body;

    // Check if template exists
    const existing = await convexClient.query(api.emailTemplates.getById, { id: id as any });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Check for duplicate name (excluding current template)
    if (name && name !== existing.name) {
      const duplicate = await convexClient.query(api.emailTemplates.getByName, { name });
      if (duplicate) {
        return NextResponse.json(
          { error: 'A template with this name already exists' },
          { status: 400 }
        );
      }
    }

    // If setting as default, unset other defaults
    if (isDefault && !existing.isDefault) {
      await convexClient.mutation(api.emailTemplates.clearDefaults, {});
    }

    const updateData: Record<string, any> = {};
    if (name) updateData.name = name;
    if (subject) updateData.subject = subject;
    if (greeting) updateData.greeting = greeting;
    if (bodyText) updateData.body = bodyText;
    if (closing) updateData.closing = closing;
    if (typeof isDefault === 'boolean') updateData.isDefault = isDefault;

    const template = await convexClient.mutation(api.emailTemplates.update, {
      id: id as any,
      data: updateData,
    });

    // Fetch with partners for response
    const templateWithPartners = await convexClient.query(api.emailTemplates.getWithPartners, { id: id as any });

    return NextResponse.json({ ...templateWithPartners, id: templateWithPartners?._id });
  } catch (error) {
    console.error('Error updating email template:', error);
    return NextResponse.json(
      { error: 'Failed to update email template' },
      { status: 500 }
    );
  }
}

// DELETE email template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can delete templates
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    // Check if template exists (with partners)
    const template = await convexClient.query(api.emailTemplates.getWithPartners, { id: id as any });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Prevent deleting default template
    if (template.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete the default template' },
        { status: 400 }
      );
    }

    // Prevent deleting template with assigned partners
    if (template.partners && template.partners.length > 0) {
      const partnerNames = template.partners.map((p: any) => p.name).join(', ');
      return NextResponse.json(
        { error: `Cannot delete template. It is assigned to: ${partnerNames}` },
        { status: 400 }
      );
    }

    await convexClient.mutation(api.emailTemplates.remove, { id: id as any });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting email template:', error);
    return NextResponse.json(
      { error: 'Failed to delete email template' },
      { status: 500 }
    );
  }
}
