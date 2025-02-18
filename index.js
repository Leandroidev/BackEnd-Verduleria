const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');

const PORT = 5000;
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'tu_clave_secreta_super_segura'; // Cambia esta clave por algo único y seguro
const VALID_USER = {
  username: 'admin',
  password: '123',
};
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  console.log("intentando autentificar");

  if (!token) {
    return res.status(403).json({ message: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token inválido o expirado' });
  }
};

// Ruta de login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  console.log("intentando logear");
  
  if (username === VALID_USER.username && password === VALID_USER.password) {
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
    return res.json({ token });
  }

  return res.status(401).json({ message: 'Credenciales inválidas' });
});

// Ruta para obtener productos
app.get('/api/products', (req, res) => {
  console.log("Obteniendo productos...");
  fs.readFile(path.join(__dirname, 'public', 'data.json'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer el archivo' });
    }
    res.json(JSON.parse(data));
  });
});
//ruta para agregar un producto
app.post('/api/products', authenticateJWT, (req, res) => {
  const { editedProduct } = req.body;

  if (!editedProduct || Object.keys(editedProduct).length === 0) {
    return res.status(400).json({ error: 'Datos del producto no proporcionados' });
  }

  fs.readFile(path.join(__dirname, 'public', 'data.json'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer el archivo' });
    }

    let products = JSON.parse(data);

    // Encontrar el primer ID libre
    let nextId = 0;
    while (products.some(product => product.id === nextId)) {
      nextId++;
    }

    // Crear el nuevo producto con el ID asignado
    const newProduct = {
      id: nextId,
      ...editedProduct,
    };

    // Agregar el nuevo producto a la lista
    products.push(newProduct);

    // Escribir los cambios en el archivo
    fs.writeFile(path.join(__dirname, 'public', 'data.json'), JSON.stringify(products, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).json({ error: 'Error al escribir en el archivo' });
      }

      // Emitir evento a través de Socket.IO para notificar el cambio
      io.emit('productoCreado', newProduct);

      // Responder con éxito y devolver el producto creado
      res.status(201).json(newProduct);
    });
  });
});
// Ruta para actualizar un producto
app.put('/api/products/:id', authenticateJWT, (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const { editedProduct } = req.body;

  fs.readFile(path.join(__dirname, 'public', 'data.json'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer el archivo' });
    }

    let products = JSON.parse(data);
    const productIndex = products.findIndex((p) => p.id === productId);

    if (productIndex === -1) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    products[productIndex] = { ...products[productIndex], ...editedProduct };

    fs.writeFile(path.join(__dirname, 'public', 'data.json'), JSON.stringify(products, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).json({ error: 'Error al escribir en el archivo' });
      }

      io.emit('productoActualizado', products[productIndex]);
      res.json(products[productIndex]);
    });
  });
});

// Ruta para eliminar un producto
app.delete('/api/products/:id', authenticateJWT, (req, res) => {
  const productId = parseInt(req.params.id, 10);

  fs.readFile(path.join(__dirname, 'public', 'data.json'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer el archivo' });
    }

    let products = JSON.parse(data);
    const productIndex = products.findIndex((p) => p.id === productId);

    if (productIndex === -1) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const deletedProduct = products.splice(productIndex, 1);

    fs.writeFile(path.join(__dirname, 'public', 'data.json'), JSON.stringify(products, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).json({ error: 'Error al escribir en el archivo' });
      }

      io.emit('productoEliminado', productId); // Emitir evento de eliminación
      res.json(deletedProduct[0]);
    });
  });
});

app.post('/api/products/disable-all', authenticateJWT, (req, res) => {
  console.log("Cambiando la propiedad 'disponible' de todos los productos a false...");
  
  fs.readFile(path.join(__dirname, 'public', 'data.json'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer el archivo' });
    }

    let products = JSON.parse(data);

    // Cambiar la propiedad "disponible" de todos los productos a false
    products = products.map(product => ({
      ...product,
      disponible: false
    }));
    console.log(products);
    
    // Escribir los cambios en el archivo
    fs.writeFile(path.join(__dirname, 'public', 'data.json'), JSON.stringify(products, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).json({ error: 'Error al escribir en el archivo' });
      }

      // Emitir evento a través de Socket.IO para notificar el cambio
      io.emit('productosDeshabilitados');

      // Responder con éxito
      res.json({ message: 'Todos los productos han sido deshabilitados' });
    });
  });
});
app.post('/api/products/enable-all', authenticateJWT, (req, res) => {
  console.log("Cambiando la propiedad 'disponible' de todos los productos a true...");
  
  fs.readFile(path.join(__dirname, 'public', 'data.json'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer el archivo' });
    }

    let products = JSON.parse(data);

    // Cambiar la propiedad "disponible" de todos los productos a true
    products = products.map(product => ({
      ...product,
      disponible: true
    }));

    // Escribir los cambios en el archivo
    fs.writeFile(path.join(__dirname, 'public', 'data.json'), JSON.stringify(products, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).json({ error: 'Error al escribir en el archivo' });
      }

      // Emitir evento a través de Socket.IO para notificar el cambio
      io.emit('productosHabilitados');

      // Responder con éxito
      res.json({ message: 'Todos los productos han sido habilitados' });
    });
  });
});
// Iniciar el servidor 
server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
