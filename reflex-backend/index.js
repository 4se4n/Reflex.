const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// --- Zod Validation Schemas ---
const createDeliverySchema = z.object({
  customerName: z.string().min(2, "Customer name is required"),
  customerPhone: z.string().min(10, "Phone number must be at least 10 digits"),
  deliveryAddress: z.string().min(3, "Delivery address is required"),
  itemDescription: z.string().min(2, "Item description is required")
});

const assignRiderSchema = z.object({
  riderId: z.string().min(1, "Rider ID is required")
});

const updateStatusSchema = z.object({
  status: z.enum(["PICKED_UP", "DELIVERED"]),
  confirmationCode: z.string().optional()
});

// --- API ENDPOINTS ---

// 1. POST /api/deliveries (Retailer Logs Delivery)
app.post('/api/deliveries', async (req, res) => {
  try {
    const validatedData = createDeliverySchema.parse(req.body);
    const trackingCode = `REF-${Math.floor(1000 + Math.random() * 9000)}`;

    const delivery = await prisma.deliveryRequest.create({
      data: {
        ...validatedData,
        trackingCode
      }
    });

    res.status(201).json(delivery);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. GET /api/deliveries (Dispatcher Queue & Rider Polling)
app.get('/api/deliveries', async (req, res) => {
  try {
    const deliveries = await prisma.deliveryRequest.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(deliveries);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch deliveries" });
  }
});

// 3. GET /api/deliveries/:trackingCode (Public Tracking Search)
app.get('/api/deliveries/:trackingCode', async (req, res) => {
  try {
    const delivery = await prisma.deliveryRequest.findUnique({
      where: { trackingCode: req.params.trackingCode.toUpperCase() }
    });

    if (!delivery) {
      return res.status(404).json({ message: "Tracking ID not found. Please check and try again." });
    }

    res.json(delivery);
  } catch (error) {
    res.status(500).json({ message: "Server error fetching tracking info" });
  }
});

// 4. PATCH /api/deliveries/:id/assign (Dispatcher Assigns Rider)
app.patch('/api/deliveries/:id/assign', async (req, res) => {
  try {
    const { riderId } = assignRiderSchema.parse(req.body);

    const updated = await prisma.deliveryRequest.update({
      where: { id: req.params.id },
      data: { assignedRider: riderId }
    });

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: "Failed to assign rider" });
  }
});

// 5. PATCH /api/deliveries/:id/status (Rider Updates Status & Transition Machine)
app.patch('/api/deliveries/:id/status', async (req, res) => {
  try {
    const { status, confirmationCode } = updateStatusSchema.parse(req.body);
    const existing = await prisma.deliveryRequest.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    if (status === 'PICKED_UP' && existing.status !== 'ASSIGNED') {
      return res.status(400).json({ message: "Can only pick up orders currently in ASSIGNED status" });
    }

    if (status === 'DELIVERED') {
      if (existing.status !== 'PICKED_UP') {
        return res.status(400).json({ message: "Cannot mark as DELIVERED without picking up first" });
      }
      if (!confirmationCode) {
        return res.status(400).json({ message: "Confirmation code required to complete delivery" });
      }
    }

    const updated = await prisma.deliveryRequest.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(confirmationCode && { confirmationCode })
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: "Failed to update status" });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Reflex Backend active on http://localhost:${PORT}`);
});