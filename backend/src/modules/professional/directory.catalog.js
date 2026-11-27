// Controlled places for the fictional Mexican directory. Private legacy text is never projected.
export const directoryLocations = Object.freeze({
  'Aguascalientes': ['Aguascalientes'],
  'Baja California': ['Mexicali', 'Tijuana', 'Ensenada'],
  'Baja California Sur': ['La Paz', 'Los Cabos'],
  'Campeche': ['Campeche', 'Ciudad del Carmen'],
  'Chiapas': ['Tuxtla Gutiérrez', 'San Cristóbal de las Casas', 'Tapachula'],
  'Chihuahua': ['Chihuahua', 'Ciudad Juárez', 'Delicias', 'Cuauhtémoc'],
  'Ciudad de México': ['Ciudad de México'],
  'Coahuila': ['Saltillo', 'Torreón', 'Monclova'],
  'Colima': ['Colima', 'Manzanillo'],
  'Durango': ['Durango', 'Gómez Palacio'],
  'Estado de México': ['Toluca', 'Ecatepec', 'Naucalpan', 'Nezahualcóyotl'],
  'Guanajuato': ['Guanajuato', 'León', 'Irapuato', 'Celaya'],
  'Guerrero': ['Chilpancingo', 'Acapulco', 'Iguala'],
  'Hidalgo': ['Pachuca', 'Tulancingo'],
  'Jalisco': ['Guadalajara', 'Zapopan', 'Puerto Vallarta'],
  'Michoacán': ['Morelia', 'Uruapan', 'Zamora'],
  'Morelos': ['Cuernavaca', 'Cuautla'],
  'Nayarit': ['Tepic', 'Bahía de Banderas'],
  'Nuevo León': ['Monterrey', 'Guadalupe', 'San Nicolás de los Garza'],
  'Oaxaca': ['Oaxaca de Juárez', 'Salina Cruz'],
  'Puebla': ['Puebla', 'Tehuacán'],
  'Querétaro': ['Querétaro', 'San Juan del Río'],
  'Quintana Roo': ['Chetumal', 'Cancún', 'Playa del Carmen'],
  'San Luis Potosí': ['San Luis Potosí', 'Ciudad Valles'],
  'Sinaloa': ['Culiacán', 'Mazatlán', 'Los Mochis'],
  'Sonora': ['Hermosillo', 'Ciudad Obregón', 'Nogales'],
  'Tabasco': ['Villahermosa', 'Cárdenas'],
  'Tamaulipas': ['Ciudad Victoria', 'Tampico', 'Reynosa', 'Matamoros'],
  'Tlaxcala': ['Tlaxcala', 'Apizaco'],
  'Veracruz': ['Xalapa', 'Veracruz', 'Coatzacoalcos'],
  'Yucatán': ['Mérida', 'Valladolid'],
  'Zacatecas': ['Zacatecas', 'Fresnillo'],
});

export const directoryModalities = Object.freeze({
  in_person: 'presencial',
  online: 'en línea',
  both: 'presencial y en línea',
});

export const approvedApproachCodes = Object.freeze(['candidate_cbt', 'candidate_systemic', 'candidate_humanist']);

export const isDirectoryLocation = (city, state) =>
  Object.hasOwn(directoryLocations, state) && directoryLocations[state].includes(city);
