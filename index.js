require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: ['http://localhost:5173'],
  credentials: true,
  optionSuccessStatus: 200,
};

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2a8vu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

// user collections
const usersCollection = client.db("HandsOn").collection("users");
const eventsCollection = client.db("HandsOn").collection("events");
const eventParticipantsCollection = client.db("HandsOn").collection("eventParticipants");
const helpRequestsCollection = client.db("HandsOn").collection("helpRequests");
const teamsCollection = client.db("HandsOn").collection("teams");



// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// JWT Authentication Middleware
const verifyJwt = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; 

  if (!token) {
    return res.status(401).send({ error: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: 'Invalid token' });
    }

    req.user = decoded;
    next();
  });
};

// Save user in DB and generate JWT token
app.post('/users/:email', async (req, res) => {
  const email = req.params.email;
  const query = { email };
  const user = req.body;

  try {
    const isExist = await usersCollection.findOne(query);
    if (isExist) {
      const token = jwt.sign(
        { email: isExist.email, role: isExist.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      return res.send({ user: isExist, token });
    }

    const result = await usersCollection.insertOne({
      ...user,
      role: 'viewer',
      timestamp: new Date(),
    });

    const token = jwt.sign(
      { email: user.email, role: 'viewer' },
      process.env.JWT_SECRET,
      { expiresIn: '10h' }
    );

    res.send({ user: result, token });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Failed to save user.' });
  }
});

app.get('/users/:email', verifyJwt, async (req, res) => {
  const email = req.params.email;

  try {
    // Check if the user is authorized
    if (req.user.email !== email && req.user.role !== 'admin') {
      return res.status(403).send({ error: 'You are not authorized to access this data' });
    }

    // Find and return the user
    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).send({ error: 'User not found' });
    }

    res.send(user);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Failed to retrieve user.' });
  }
});


// update profile
app.put('/users/:email', verifyJwt, async (req, res) => {
  const email = req.params.email;
  const updateData = req.body;

  if (req.user.email !== email && req.user.role !== 'admin') {
    return res.status(403).send({ error: 'You are not authorized to update this profile' });
  }

  if (!email || !updateData) {
    return res.status(400).send({ message: "Invalid request, missing email or update data" });
  }

  const filter = { email };
  const updateDoc = { $set: updateData };

  try {
    const result = await usersCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "User not found" });
    }

    res.send({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).send({ error: "Failed to update profile" });
  }
});






// Create Event Route
app.post('/create-event', verifyJwt, async (req, res) => {
  const { title, category, description, date, time, location, imageUrl, email } = req.body;

  if (!title || !category || !description || !date || !time || !location || !imageUrl || !email) {
    return res.status(400).send({ error: 'All fields are required' });
  }

  try {
    const event = {
      title,
      category,
      description,
      date,
      time,
      location,
      imageUrl,
      email,
      timestamp: new Date(),
    };

    const result = await eventsCollection.insertOne(event);

    if (result.acknowledged) {
      res.status(201).send({ success: true, message: 'Event created successfully' });
    } else {
      res.status(500).send({ success: false, message: 'Failed to create event' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: 'Failed to create event' });
  }
});

// get all events
app.get('/all-events', async (req, res) => {
  const { searchTerm, category, location } = req.query;

  try {
    // Create a base query object
    let query = {};

    if (searchTerm) {
      query.title = { $regex: searchTerm, $options: 'i' }; 
    }

    if (category) {
      query.category = category; 
    }

    if (location) {
      query.location = location; 
    }

    // Fetch events based on the constructed query
    const result = await eventsCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).send({ message: 'Error fetching events' });
  }
});



// Get single event by ID
app.get('/event/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };

  try {
    const event = await eventsCollection.findOne(query);
    if (event) {
      res.send(event);
    } else {
      res.status(404).send({ message: 'Event not found' });
    }
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).send({ message: 'Error fetching event' });
  }
});


// Get events by user's email
app.get('/my-events/:email', verifyJwt, async (req, res) => {
  const email = req.params.email;
  
  try {
    const query = { email: email };
    const events = await eventsCollection.find(query).toArray();

    res.send(events);
  } catch (error) {
    console.error('Error fetching events by email:', error);
    res.status(500).send({ message: 'Internal Server Error', error });
  }
});

// Get 5 recent events by user's email
app.get('/recent-events', async (req, res) => {
  try {
    const events = await eventsCollection
      .find({})
      .sort({ timestamp: -1 }) 
      .limit(5)
      .toArray();

    res.send(events);
  } catch (error) {
    console.error('Error fetching recent events:', error);
    res.status(500).send({ message: 'Internal Server Error', error });
  }
});


// Update user profile
app.put('/users/:email', verifyJwt, async (req, res) => {
  const email = req.params.email;
  const updateData = req.body;

  if (!email || !updateData) {
    return res.status(400).send({ message: "Invalid request" });
  }

  // Filter for finding the user by email
  const filter = { email };

  // The new data to update in the user's profile
  const updateDoc = { $set: updateData };

  try {
    const result = await usersCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "User not found" });
    }

    res.send({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error('Error updating profile:', error); 
    res.status(500).send({ error: "Failed to update profile" });
  }
});




// Delete an event by ID
app.delete('/delete-event/:id', verifyJwt, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await eventsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      res.send({ success: true, message: 'Event deleted successfully' });
    } else {
      res.status(404).send({ success: false, message: 'Event not found' });
    }
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).send({ success: false, message: 'Internal Server Error', error });
  }
});

// update events
app.put('/update-event/:id', verifyJwt, async (req, res) => {
  const id = req.params.id;
  const updatedEventData = req.body;

  const query = { _id: new ObjectId(id) };
  const options = { upsert: false };

  const updateDoc = {
    $set: {
      title: updatedEventData.title,
      category: updatedEventData.category,
      description: updatedEventData.description,
      date: updatedEventData.date,
      time: updatedEventData.time,
      location: updatedEventData.location,
      imageUrl: updatedEventData.imageUrl,
      email: updatedEventData.email,
    },
  };

  try {
    const result = await eventsCollection.updateOne(query, updateDoc, options);

    if (result.modifiedCount === 0) {
      return res.status(404).send({ message: "Event not found or no changes made" });
    }

    res.send({ message: "Event updated successfully", result });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update event", error });
  }
});

// Join Event Route
app.post("/join-event", verifyJwt, async (req, res) => {
  const { eventId } = req.body;
  const { email } = req.user; // JWT stores the user's email

  if (!eventId) {
    return res.status(400).send({ error: "Event ID is required" });
  }

  try {
    // Check if user has already joined the event
    const existingParticipant = await eventParticipantsCollection.findOne({
      email,
      eventId: new ObjectId(eventId),
    });

    if (existingParticipant) {
      return res.status(400).send({ message: "You have already joined this event" });
    }

    // Add user to the eventParticipants collection
    const result = await eventParticipantsCollection.insertOne({
      email,
      eventId: new ObjectId(eventId),
      timestamp: new Date(),
    });

    res.status(200).send({ success: true, message: "Joined event successfully" });
  } catch (error) {
    console.error("Error joining event:", error);
    res.status(500).send({ message: "Failed to join event" });
  }
});


// my join 
app.get("/my-join-events", verifyJwt, async (req, res) => {
  const { email } = req.user; 

  try {
    const participantEvents = await eventParticipantsCollection.find({ email }).toArray();

    if (participantEvents.length === 0) {
      return res.status(404).send({ message: "No events found for this user" });
    }

    const eventIds = participantEvents.map(event => event.eventId);
    const eventsDetails = await eventsCollection.find({ _id: { $in: eventIds } }).toArray();

    const eventsWithDetails = participantEvents.map(participantEvent => {
      const fullEvent = eventsDetails.find(event => event._id.toString() === participantEvent.eventId.toString());
      return { ...participantEvent, event: fullEvent };
    });

    res.status(200).send({ success: true, events: eventsWithDetails });
  } catch (error) {
    console.error("Error retrieving user events:", error);
    res.status(500).send({ message: "Failed to retrieve events" });
  }
});

// create help request related api
app.post('/help-request', verifyJwt, async (req, res) => {
  const { title, description, urgency, location, email } = req.body;

  if (!title || !description || !urgency || !location || !email) {
    return res.status(400).send({ error: 'All fields are required' });
  }

  try {
    const helpRequest = {
      title,
      description,
      urgency,
      location,
      email,
      timestamp: new Date(),
      comments: [],
    };

    const result = await helpRequestsCollection.insertOne(helpRequest);

    if (result.acknowledged) {
      res.status(201).send({ success: true, message: 'Help request posted successfully' });
    } else {
      res.status(500).send({ success: false, message: 'Failed to post help request' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: 'Failed to post help request' });
  }
});

// Get all help requests (with optional urgency filter)
app.get('/help-requests', async (req, res) => {
  const { urgency } = req.query;
  let query = urgency ? { urgency } : {};

  try {
    const result = await helpRequestsCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error('Error fetching help requests:', error);
    res.status(500).send({ message: 'Error fetching help requests' });
  }
});

// Add a comment to a help request
app.post('/help-request/:id/comment', verifyJwt, async (req, res) => {
  const { id } = req.params; 
  const { commentText } = req.body; 

  if (!commentText) {
    return res.status(400).send({ error: 'Comment text is required' });
  }

  const { name, email } = req.user; 

  try {
    
    const result = await helpRequestsCollection.updateOne(
      { _id: new ObjectId(id) }, 
      {
        $push: {
          comments: {
            text: commentText,
            userName: name || email,  
            timestamp: new Date(),
          },
        },
      }
    );

    if (result.matchedCount > 0) {
      res.status(200).send({ success: true, message: 'Comment added successfully' });
    } else {
      res.status(404).send({ success: false, message: 'Help request not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: 'Failed to add comment' });
  }
});


// Create Team Route
app.post('/create-team', verifyJwt, async (req, res) => {
  const { teamName, description, teamType, inviteEmails } = req.body;

  if (!teamName || !description || !teamType) {
    return res.status(400).send({ success: false, error: "All fields are required" });
  }

  try {
    const team = {
      teamName,
      description,
      teamType,
      inviteEmails: teamType === "private" ? inviteEmails || [] : [],
      createdAt: new Date(),
    };

    const result = await teamsCollection.insertOne(team);

    if (result.acknowledged) {
      res.status(201).send({ success: true, message: "Team created successfully" });
    } else {
      res.status(500).send({ success: false, message: "Failed to create team" });
    }
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
});









// Generate JWT token
app.post('/jwt', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ message: 'Email is required.' });
  }

  const query = { email };
  usersCollection.findOne(query).then(user => {
    if (!user) {
      return res.status(404).send({ message: 'User not found.' });
    }

    const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.send({ success: true, token });
  }).catch(err => {
    console.error(err);
    res.status(500).send({ error: 'Failed to generate token.' });
  });
});

app.get('/', (req, res) => {
  res.send('handson server running');
});

app.listen(port, () => {
  console.log(`handson running on port: ${port}`);
});
