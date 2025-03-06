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
