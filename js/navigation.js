/* Reisblik 9.7.5 – Navigatie */
function openNavigationToLocation(x){
 const lat=Number(x?.lat ?? x?.latitude);
 const lon=Number(x?.lon ?? x?.lng ?? x?.longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)){
  alert('Voor deze locatie zijn geen geldige GPS-coördinaten beschikbaar.');
  return false;
 }
 const url='https://www.google.com/maps/dir/?api=1&destination='+
   encodeURIComponent(String(lat)+','+String(lon))+
   '&travelmode=walking';
 window.location.href=url;
 return false;
}

function openNavigationToLocationById(id){
 const key=String(id);
 const x=locations.find(a=>String(a.id)===key);
 if(!x){
  alert('Deze locatie kon niet worden gevonden.');
  return false;
 }
 return openNavigationToLocation(x);
}
